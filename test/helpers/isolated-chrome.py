#!/usr/bin/env python3
"""CHROME_BIN shim: preserve CDP fds, isolate dump-DOM profiles, cap probes."""
import fcntl
import os
from pathlib import Path
import sys
import tempfile
import socket

# Wait before exec, without wrapping Chrome or touching its CDP descriptors.
with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as gate:
    gate.connect('\0' + os.environ['HARNESS_CHROME_GATE'])
    if gate.recv(1) != b'G':
        raise SystemExit('Chrome admission closed before quiescence')
counter = Path(os.environ['HARNESS_CHROME_COUNTER'])
with counter.open('r+') as stream:
    fcntl.flock(stream, fcntl.LOCK_EX)
    count = int(stream.read()) + 1
    if count > int(os.environ['HARNESS_CHROME_LIMIT']):
        raise SystemExit('Chrome launch budget exhausted')
    stream.seek(0)
    stream.write(str(count))
    stream.truncate()
args = sys.argv[1:]
if not any(arg == '--user-data-dir' or arg.startswith('--user-data-dir=') for arg in args):
    profile = tempfile.mkdtemp(prefix='codex-dump-dom-', dir=os.environ['TMPDIR'])
    args.append('--user-data-dir=' + profile)
chrome = os.environ['HARNESS_CHROME_EXECUTABLE']
os.execv(chrome, [chrome, *args])
