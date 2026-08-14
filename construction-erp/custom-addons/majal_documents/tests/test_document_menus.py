from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalDocumentMenus(TransactionCase):
    def test_dms_library_is_inside_the_majal_documents_workspace(self):
        root = self.env.ref("majal_documents.menu_majal_documents_root")
        library = self.env.ref("dms.main_menu_dms")
        self.assertEqual(library.parent_id, root)
        self.assertEqual(library.name, "File Library")

    def test_storage_configuration_uses_majal_language(self):
        storage = self.env.ref("dms.menu_dms_storage")
        self.assertEqual(storage.name, "Storage Backends")
