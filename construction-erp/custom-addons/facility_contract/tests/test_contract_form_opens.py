"""A facility manager must be able to open the contract, not just list it.

`facility_contract` reuses OCA's `contract.contract` for maintenance
contracts and grants the equipment-manager group full access to it and to
`contract.line`. It did not grant `contract.modification`, which OCA gates
behind `account.group_account_invoice` -- an accounting group a facility
manager has no reason to hold.

`modification_ids` is on the contract form. So the register listed fine and
every contract in it failed to open: "not allowed to access records of
'Contract Modification'". Found by a persona sweep that opens each list and
then its first record; the list alone shows nothing wrong, because
`modification_ids` is not a list column.

This grant clears that refusal and no more. The form fails again one layer
down on `account.journal`, which is an access-model decision rather than a
missing row -- see the second test, which pins that boundary deliberately.

Read alone is not enough. OCA writes a modification row from the contract's
own logic when a date changes (`_set_start_contract_modification`), so a
manager who can edit the contract needs create and write on the trail it
produces. Unlink is deliberately withheld: the audit trail of who changed
a contract and when is not theirs to erase.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestContractFormOpens(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env["res.partner"].create({"name": "Contract Co"})
        cls.contract = cls.env["contract.contract"].sudo().create({
            "name": "Chiller AMC",
            "partner_id": cls.partner.id,
        })

    def _facility_manager(self):
        return new_test_user(
            self.env, login="contract.fm", password="contract-fm-pw-2026",
            groups="maintenance.group_equipment_manager")

    def test_the_manager_can_read_the_modification_trail(self):
        user = self._facility_manager()
        self.env.invalidate_all()
        # Raised AccessError before the ACL row was added.
        self.env["contract.modification"].with_user(user).search([])

    def test_the_contract_form_still_needs_an_accounting_decision(self):
        """Documents what this fix does NOT reach.

        Granting the modification trail lets the manager past the first
        refusal. The form then fails again one layer down: OCA computes
        `currency_id` from `journal_id.currency_id`, and `account.journal`
        is not readable by a facility manager either. contract.contract is
        an accounting object that Majal reuses for maintenance contracts,
        so opening it fully means deciding how much of the accounting model
        a facility manager sees -- the same question already open for
        commercial users and the general ledger.

        This test pins the current boundary rather than pretending it is
        not there: if somebody widens the accounting grants, it fails and
        they are made to notice that this was a deliberate line.
        """
        from odoo.exceptions import AccessError

        user = self._facility_manager()
        self.env.invalidate_all()
        with self.assertRaises(AccessError):
            self.env["account.journal"].with_user(user).search([], limit=1)

    def test_the_manager_cannot_erase_the_trail(self):
        """Least privilege: create and write, never unlink.

        Who changed a contract and when is exactly the record somebody
        would want gone.
        """
        user = self._facility_manager()
        access = self.env["ir.model.access"].sudo().search([
            ("model_id.model", "=", "contract.modification"),
            ("group_id", "=",
             self.env.ref("maintenance.group_equipment_manager").id),
        ])
        self.assertTrue(access, "the facility grant is missing")
        self.assertFalse(
            any(access.mapped("perm_unlink")),
            "A facility manager was granted unlink on the contract "
            "modification trail.")
