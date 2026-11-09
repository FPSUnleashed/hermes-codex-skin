#!/usr/bin/env python3
"""Linux test-only subreaper: run unchanged renderer tests, reap as they run."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import signal
import socket
import struct
import uuid
import subprocess
import sys
import time


def descendants():
    rows = {}
    for stat in Path('/proc').glob('[0-9]*/stat'):
        try:
            text = stat.read_text()
            fields = text[text.rfind(')') + 2:].split()
            rows[int(stat.parent.name)] = (int(fields[1]), int(fields[19]), fields[0])
        except (OSError, ValueError, IndexError):
            continue
    owned = {os.getpid()}
    while True:
        found = owned | {pid for pid, row in rows.items() if row[0] in owned}
        if found == owned:
            return {pid: rows[pid] for pid in owned if pid != os.getpid()}
        owned = found


def terminate_owned(rows):
    current = descendants()
    for pid, row in rows.items():
        # An owned PID can disappear/recycle during cleanup. Match start time too.
        if pid in current and current[pid][1] == row[1]:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


class ChromeAdmission:
    """Serialize exec until the prior process and adopted children are reaped."""
    def __init__(self, root_pid):
        self.root_pid = root_pid
        self.name = 'codex-chrome-' + str(os.getpid()) + '-' + uuid.uuid4().hex
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.bind('\0' + self.name)
        self.socket.listen()
        self.socket.setblocking(False)
        self.pending = []
        self.active = None
        self.clean_sweeps = 0
        self.admissions = []

    def service(self):
        while True:
            try:
                connection, _ = self.socket.accept()
            except BlockingIOError:
                break
            pid, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            # A legitimate shim can be born while accept() is pending.
            rows = descendants()
            if uid != os.getuid() or pid not in rows:
                connection.close()
                continue
            self.pending.append((connection, pid, rows[pid][1], time.monotonic()))
        rows = descendants()
        alive = self.active and self.active[0] in rows and rows[self.active[0]][1] == self.active[1]
        # With no running prior root, all its surviving branches have been
        # adopted by this subreaper. Do not kill live children to admit work.
        adopted = {pid: row for pid, row in rows.items() if row[0] == os.getpid() and pid != self.root_pid}
        if alive or adopted:
            self.clean_sweeps = 0
            return
        self.clean_sweeps += 1
        if self.clean_sweeps < 2:
            return
        while self.pending:
            connection, pid, starttime, requested = self.pending.pop(0)
            try:
                current = descendants().get(pid)
                if current is None or current[1] != starttime:
                    continue
                connection.sendall(b'G')
            except (BrokenPipeError, ConnectionResetError):
                continue
            finally:
                connection.close()
            self.admissions.append({'pid': pid, 'starttime': starttime,
                                    'wait_seconds': time.monotonic() - requested,
                                    'previous': self.active, 'adopted_remaining': {}})
            self.active = (pid, starttime)
            self.clean_sweeps = 0
            break

    def close(self):
        for connection, *_ in self.pending:
            connection.close()
        self.socket.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--timeout', type=float, required=True)
    parser.add_argument('--max-chrome-launches', type=int, required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or args.timeout <= 0 or args.max_chrome_launches <= 0:
        parser.error('positive limits and an explicit command are required')
    if sys.platform != 'linux':
        parser.error('this renderer harness is Linux-only')
    scratch = Path(os.environ['TMPDIR']).resolve()
    assert scratch.is_dir() and str(scratch) != '/tmp'
    assert Path(args.chrome).is_absolute() and os.access(args.chrome, os.X_OK)
    cg = Path('/sys/fs/cgroup') / Path('/proc/self/cgroup').read_text().strip().split('::')[1].lstrip('/')
    def pids():
        return int((cg / 'pids.current').read_text())
    assert pids() <= 450, 'process-budget preflight refused'
    assert ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) == 0
    receipt = Path(args.receipt)
    assert not receipt.exists(), 'never overwrite a prior receipt'
    counter = receipt.with_suffix(receipt.suffix + '.launches')
    counter.write_text('0')
    admission = ChromeAdmission(None)
    env = {**os.environ, 'CHROME_BIN': str(Path(__file__).with_name('isolated-chrome.py')),
           'HARNESS_CHROME_EXECUTABLE': args.chrome, 'HARNESS_CHROME_COUNTER': str(counter),
           'HARNESS_CHROME_LIMIT': str(args.max_chrome_launches),
           'HARNESS_CHROME_GATE': admission.name}
    stopped = []
    def stop(signum, _frame):
        stopped.append(f'signal:{signum}')
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    start = time.monotonic()
    root = subprocess.Popen(command, env=env, start_new_session=True)
    admission.root_pid = root.pid
    root_identity = descendants().get(root.pid)
    root_code = None
    reaped = []
    snapshots = []
    def reap():
        nonlocal root_code
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                return
            if not pid:
                return
            if pid == root.pid:
                root_code = os.waitstatus_to_exitcode(status)
                root.returncode = root_code
            else:
                reaped.append({'pid': pid, 'status': status})
    try:
        while root_code is None and not stopped:
            reap()
            current = pids()
            snapshots.append({'elapsed': time.monotonic() - start, 'pids': current})
            if current > 450:
                stopped.append('pids.current>450')
            if time.monotonic() - start > args.timeout:
                stopped.append('timeout')
            if not stopped and root_code is None:
                admission.service()
            time.sleep(.02)
    finally:
        admission.close()
        # Includes escaped crashpad sessions, not merely root's process group.
        end = time.monotonic() + 5
        while time.monotonic() < end:
            terminate_owned(descendants())
            reap()
            if not descendants():
                break
            time.sleep(.02)
        remaining = descendants()
        data = {'command': command, 'root_pid': root.pid, 'root_identity': root_identity,
                'exit_code': root_code, 'stopped': stopped, 'reaped_descendants': reaped,
                'owned_remaining': remaining, 'snapshots': snapshots,
                'chrome_launches': int(counter.read_text()), 'pids_after': pids(),
                'chrome_admissions': admission.admissions,
                'duration_seconds': time.monotonic() - start}
        with receipt.open('x') as stream:
            json.dump(data, stream, indent=2)
            stream.write('\n')
    if stopped or remaining or root_code is None:
        return 125
    return root_code if root_code >= 0 else 128 - root_code


if __name__ == '__main__':
    sys.exit(main())
