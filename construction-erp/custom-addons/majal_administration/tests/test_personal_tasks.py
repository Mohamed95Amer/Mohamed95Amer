"""A private task is still private, and still reachable.

The tenant rule for project.task scoped every row by
`project_id.company_id`. Every other model in that map hangs off a project,
so the clause is complete for them; a task is the exception, because Odoo
lets a user keep a task with no project at all. Under a plain company clause
such a row can never match, and the rule is global -- ANDed with core's own
"full access to own private task only" -- so nothing could rescue it.

What that looked like in the product: the stock To-do menu, which creates
exactly such a task the first time it is opened, raised an access error for
all nine demo personas including the Platform Owner. The superuser is exempt
from record rules, which is why it survived every check made as admin.

Both halves are tested. Restoring the personal leg must not become a way to
read a colleague's private task, and must not reopen the construction
register to a facilities-scoped user.
"""

from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestPersonalTasks(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env["res.company"].create({"name": "Task Co"})
        cls.env["res.users"]._majal_install_tenant_rules()

        def user(login, scope):
            record = new_test_user(
                cls.env, login=login, password=f"{login}-pw-2026-long",
                groups="construction_base.group_construction_user,"
                       "project.group_project_user",
                company_id=cls.company.id,
                company_ids=[(6, 0, [cls.company.id])])
            record.majal_industry_scope = scope
            return record

        cls.builder = user("todo.builder", "construction")
        cls.colleague = user("todo.colleague", "construction")
        cls.facilities = user("todo.facilities", "facilities")

    def _cold(self):
        """Drop the cache before reading as someone else.

        Odoo's cache lives on the transaction, not the environment, so a
        value already fetched as the superuser is served to the next reader
        without any rule being consulted. Twice on this branch that made a
        test pass against unfixed code.
        """
        self.env.invalidate_all()

    def _todo(self, user, name):
        return self.env["project.task"].with_user(user).create({
            "name": name,
            "user_ids": [(6, 0, [user.id])],
        })

    def _readable(self, user, task):
        """Whether the row survives the rules for this user.

        search() rather than exists(): exists() issues a plain row lookup and
        never applies a record rule, so it reports every task as present.
        """
        self._cold()
        return bool(self.env["project.task"].with_user(user)
                    .search([("id", "=", task.id)]))

    def test_a_construction_user_can_keep_a_private_task(self):
        task = self._todo(self.builder, "Order the rebar")
        self.assertTrue(self._readable(self.builder, task))

    def test_a_facilities_user_can_keep_a_private_task(self):
        """The register is not theirs; their own to-do list is.

        This is the branch that returned [(0, '=', 1)] -- match nothing at
        all -- so an FM user could not create a to-do even in principle.
        """
        task = self._todo(self.facilities, "Chase the chiller quote")
        self.assertTrue(self._readable(self.facilities, task))

    def test_a_private_task_stays_private(self):
        task = self._todo(self.builder, "Salary review notes")
        self.assertFalse(
            self._readable(self.colleague, task),
            "A colleague read a private task with no project. The personal "
            "leg must be qualified by user_ids, not by the absence of a "
            "project.")

    def test_a_colleague_cannot_write_to_a_private_task(self):
        task = self._todo(self.builder, "Draft the claim position")
        self._cold()
        with self.assertRaises(AccessError):
            task.with_user(self.colleague).write({"name": "Rewritten"})

    def test_the_facilities_scope_still_hides_the_construction_register(self):
        """The guard on the fix itself.

        The personal leg is ORed into every branch. Written carelessly -- a
        trailing leaf after '|', which Odoo ANDs in at the end rather than
        rejecting -- it would turn the facilities branch from "nothing" into
        "everything", and the leak would look exactly like a passing test
        for the three cases above.
        """
        project = self.env["project.project"].create({
            "name": "Tower B", "company_id": self.company.id,
        })
        theirs = self.env["project.task"].create({
            "name": "Pour level 3", "project_id": project.id,
        })
        self.assertFalse(self._readable(self.facilities, theirs))
