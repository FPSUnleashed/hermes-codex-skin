"""Focused real-Chrome regressions. Five launches total, never a full suite."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent
OUT = Path(os.environ['RESOURCE_RECEIPTS'])


class ChromiumResourceTests(unittest.TestCase):
    def scenario(self, name, expected_code, marker, launches):
        receipt = OUT / (name + '.json')
        command = [sys.executable, str(HERE / 'helpers/chromium-suite.py'),
                   '--chrome', '/usr/bin/google-chrome-stable', '--receipt', str(receipt),
                   '--timeout', '25', '--max-chrome-launches', str(launches), '--',
                   'node', str(HERE / 'helpers/chromium-resource-probe.mjs'), name]
        completed = subprocess.run(command, text=True, capture_output=True, timeout=32)
        (OUT / (name + '.log')).write_text(completed.stdout + completed.stderr)
        data = json.loads(receipt.read_text())
        self.assertEqual(completed.returncode, expected_code, completed.stdout + completed.stderr)
        self.assertEqual(data['exit_code'], expected_code)
        self.assertEqual(data['stopped'], [])
        self.assertEqual(data['owned_remaining'], {})
        self.assertEqual(data['chrome_launches'], launches)
        self.assertIn(marker, completed.stdout + completed.stderr)
        self.assertLessEqual(max(row['pids'] for row in data['snapshots']), 450)
        if name != 'startupfailure':
            self.assertGreater(len(data['reaped_descendants']), 0, 'must exercise orphan reaping, not only a clean mock')
        print(json.dumps({'scenario': name, 'command': command, 'exit_code': completed.returncode,
                          'chrome_launches': launches, 'reaped': len(data['reaped_descendants']),
                          'remaining': data['owned_remaining']}), flush=True)

    def test_success_and_next_browser(self):
        self.scenario('success', 0, 'SUCCESS_2', 2)

    def test_startup_failure_cleanup(self):
        # Startup failure must stay nonzero. The frozen helper also surfaces ECONNRESET.
        self.scenario('startupfailure', 1, 'EXPECTED_STARTUP_FAILURE', 1)

    def test_assertion_failure_is_not_green(self):
        self.scenario('assertion', 1, 'INTENTIONAL_ASSERTION_FAILURE', 1)

    def test_dump_dom_uses_same_ownership_boundary(self):
        self.scenario('dumpdom', 0, 'DUMP_DOM_OK', 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
