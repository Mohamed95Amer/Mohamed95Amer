"""The trading summary has to agree with the ledger it reads.

Two things can go wrong with a MIS template and neither shows at install
time. The expression can reference a field that does not resolve, which
raises the first time somebody opens the report rather than when the module
loads. And the sign can be inverted — income accounts are credit-normal, so
a revenue KPI that forgets to negate reports a profitable year as a loss,
which is worse than an error because it is believable.

So this computes the report and checks the numbers against a direct read of
account.move.line. Selecting by account *type* rather than by code is what
makes the template portable across charts of accounts, and it is also what
makes this test meaningful on whatever chart the test database happens to
have.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestTradingSummary(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.report = cls.env.ref("majal_dashboard.mis_report_trading")

    def _ledger_balance(self, account_types):
        """What the ledger says, read straight, with no MIS involved."""
        self.env.cr.execute("""
            SELECT COALESCE(SUM(l.balance), 0.0)
              FROM account_move_line l
              JOIN account_account a ON a.id = l.account_id
              JOIN account_move m ON m.id = l.move_id
             WHERE a.account_type = ANY(%s)
               AND m.state = 'posted'
               AND m.date BETWEEN %s AND %s
               AND l.company_id = %s
        """, (list(account_types), "2000-01-01", "2099-12-31",
              self.env.company.id))
        return self.env.cr.fetchone()[0]

    def _compute(self):
        instance = self.env["mis.report.instance"].create({
            "name": "Trading check",
            "report_id": self.report.id,
            "company_id": self.env.company.id,
            "period_ids": [(0, 0, {
                "name": "All",
                # Fixed dates, not relative: a relative period resolves
                # against the report's base date and silently measures a
                # different window than the one the test means.
                "mode": "fix",
                "manual_date_from": "2000-01-01",
                "manual_date_to": "2099-12-31",
            })],
        })
        values = {}
        matrix = instance._compute_matrix()
        for row in matrix.iter_rows():
            cells = list(row.iter_cells())
            values[row.kpi.name] = cells[0].val if cells else None
        return values

    def test_the_template_and_its_kpis_exist(self):
        self.assertEqual(len(self.report.kpi_ids), 6)
        self.assertEqual(
            self.report.kpi_ids.sorted("sequence").mapped("name"),
            ["revenue", "direct_cost", "gross_margin", "gross_margin_pct",
             "overheads", "operating_result"])

    def test_it_selects_by_account_type_not_by_code(self):
        """A report written against codes is right on one chart of accounts
        and silently wrong on every other."""
        for kpi in self.report.kpi_ids:
            self.assertNotRegex(
                kpi.expression, r"\[\s*['\"]\d",
                f"{kpi.name} looks like it selects by account code")

    def test_it_computes_rather_than_merely_installing(self):
        """An expression referencing a field that does not resolve installs
        perfectly and raises when somebody opens the report."""
        values = self._compute()
        self.assertEqual(len(values), 6)

    def test_revenue_matches_the_ledger_and_reads_positive(self):
        """Income is credit-normal, so its balance is negative and the KPI
        negates it. Get that backwards and a profitable year reports as a
        loss — believable, and therefore worse than an error."""
        balance = self._ledger_balance(["income", "income_other"])
        values = self._compute()
        revenue = values["revenue"]
        if balance == 0:
            self.skipTest("no posted income in this database")
        self.assertAlmostEqual(float(revenue), -float(balance), places=2)
        self.assertGreater(float(revenue), 0.0,
                           "revenue should read positive")

    def test_gross_margin_is_revenue_less_direct_cost(self):
        values = self._compute()
        revenue = float(values["revenue"] or 0.0)
        direct = float(values["direct_cost"] or 0.0)
        self.assertAlmostEqual(
            float(values["gross_margin"] or 0.0), revenue - direct, places=2)

    def test_a_period_with_no_revenue_does_not_divide_by_zero(self):
        """Normal on a job that has not started certifying. An unguarded
        division takes the whole report down rather than one cell."""
        instance = self.env["mis.report.instance"].create({
            "name": "Empty period",
            "report_id": self.report.id,
            "company_id": self.env.company.id,
            "period_ids": [(0, 0, {
                "name": "Long ago",
                "mode": "fix",
                "manual_date_from": "1990-01-01",
                "manual_date_to": "1990-12-31",
            })],
        })
        matrix = instance._compute_matrix()
        self.assertTrue(list(matrix.iter_rows()))
