"""No browser: exercise the real Node executable at the resource-runner seam."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock


class SelectedNode(Exception):
    pass


class ChromiumResourceCommandTests(unittest.TestCase):
    def test_resource_command_uses_node_from_isolated_path(self):
        node = shutil.which('node')
        assert node is not None, 'run with the pinned Node toolchain on PATH'
        source = Path(__file__).with_name('chromium_resource_test.py')
        spec = importlib.util.spec_from_file_location('resource_scenarios', source)
        assert spec is not None and spec.loader is not None
        scenarios = importlib.util.module_from_spec(spec)
        run = subprocess.run
        with tempfile.TemporaryDirectory(prefix='resource-node-') as directory:
            root = Path(directory)
            selected = root / 'node'
            selected.symlink_to(Path(node).resolve())
            with mock.patch.dict(os.environ, {'PATH': directory, 'RESOURCE_RECEIPTS': directory}):
                spec.loader.exec_module(scenarios)

                def inspect(command, **_kwargs):
                    executable = command[command.index('--') + 1]
                    # Actually execute Node, but stop before the Chrome wrapper.
                    completed = run([executable, '-p', 'process.execPath'], check=True,
                                    text=True, capture_output=True, timeout=5)
                    self.assertEqual(Path(completed.stdout.strip()), Path(node).resolve())
                    self.assertEqual(shutil.which(executable), str(selected))
                    raise SelectedNode

                case = scenarios.ChromiumResourceTests('test_success_and_next_browser')
                with mock.patch.object(scenarios.subprocess, 'run', side_effect=inspect):
                    with self.assertRaises(SelectedNode):
                        case.test_success_and_next_browser()


if __name__ == '__main__':
    unittest.main(verbosity=2)
