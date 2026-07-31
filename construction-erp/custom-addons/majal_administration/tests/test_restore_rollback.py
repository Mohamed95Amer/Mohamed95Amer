"""The rollback of a failed restore must not be the thing that loses the data.

The restore script is deliberately unreachable over HTTP and runs in a one-off
container, so it is exercised here at the level that matters: the decision about
whether the live filestore may be deleted.
"""

import importlib.util
import os
import shutil
import tempfile

from odoo.tests.common import TransactionCase


def _load_restore_script():
    """Import the standalone script by path.

    It lives under scripts/ rather than in the module's Python package because
    it is run with `python3 restore_database.py`, not imported by Odoo.
    """
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "scripts", "restore_database.py")
    spec = importlib.util.spec_from_file_location("majal_restore_script", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestRestoreFilestoreRollback(TransactionCase):
    def setUp(self):
        super().setUp()
        self.script = _load_restore_script()
        self.root = tempfile.mkdtemp(prefix="majal-restore-test-")
        self.addCleanup(shutil.rmtree, self.root, True)
        self.filestore = os.path.join(self.root, "erp")
        self.safety = os.path.join(self.root, "erp.pre_restore_x")
        os.makedirs(self.filestore)
        with open(os.path.join(self.filestore, "attachment.bin"), "w") as handle:
            handle.write("the only copy")

    def _attachment_text(self):
        with open(os.path.join(self.filestore, "attachment.bin")) as handle:
            return handle.read()

    def test_a_failure_before_the_move_leaves_the_filestore_untouched(self):
        """The case that destroyed the data.

        The dump load failed, so the original was never renamed aside — the
        live filestore is still the only copy of every attachment. Rolling back
        must not touch it.
        """
        restored = self.script.rollback_filestore(
            self.filestore, self.safety, moved_filestore=False)

        self.assertFalse(restored)
        self.assertTrue(os.path.isdir(self.filestore))
        self.assertEqual(self._attachment_text(), "the only copy")

    def test_a_failure_after_the_move_puts_the_original_back(self):
        """The ordinary case: the half-restored copy goes, the original returns."""
        os.replace(self.filestore, self.safety)
        os.makedirs(self.filestore)
        with open(os.path.join(self.filestore, "attachment.bin"), "w") as handle:
            handle.write("half-restored rubbish")

        restored = self.script.rollback_filestore(
            self.filestore, self.safety, moved_filestore=True)

        self.assertTrue(restored)
        self.assertEqual(self._attachment_text(), "the only copy")
        self.assertFalse(os.path.isdir(self.safety))

    def test_a_missing_safety_copy_does_not_delete_what_is_there(self):
        """Belt and braces: if the copy has vanished, keep what remains rather
        than ending with nothing at all."""
        restored = self.script.rollback_filestore(
            self.filestore, self.safety, moved_filestore=True)

        self.assertFalse(restored)
        # The half-restored copy was removed — that is the point of the branch —
        # but nothing pretends the rollback succeeded.
        self.assertFalse(os.path.isdir(self.filestore))
