# Two screens for the two ends of the company

Most of this suite is registers: places where a kind of document lives. A
register is the right shape for *filing* something and the wrong shape for
*starting a day* or *chairing a board meeting*, because neither of those is
about one kind of document.

So there are two screens that are not registers. They hold no data of their
own — every figure on them already existed on some record — and both exist
because nothing put those figures on one page.

## My Day — *Majal → My Day*

The data was always there. Defects carry an assignee, inspections an inspector,
tasks a user, RFIs a ball-in-court, permits a supervisor, approvals a step. But
there was exactly one "my …" filter in the whole suite, so a site engineer
started the morning by opening five registers and filtering each one by hand,
and the honest result is that the fifth one did not get opened.

One screen, one line per thing that is theirs, ordered by how much trouble it
causes to ignore:

1. **Waiting for my approval** — somebody else is stopped until it is done, so
   it outranks the reader's own work no matter how late that work is.
2. Defects, inspections, tasks, RFIs, permits — each with a count and, where the
   register has a due date, how many of them are late.

A row with nothing in it is not drawn. A day with nothing on it says so rather
than showing five zeroes, because five zeroes read as a broken screen.

Tapping a row opens that register already filtered to the reader. Rows are 64px
tall — a thumb, on a ladder, in gloves — and the screen was measured at a real
390px viewport, not guessed at.

### Adding a register to it

`construction.my.day._registers()` returns a list rather than hard-coding
blocks, so another module can add its own without editing this one:

```python
class ConstructionMyDay(models.AbstractModel):
    _inherit = "construction.my.day"

    @api.model
    def _registers(self):
        return super()._registers() + [{
            "key": "workorders",
            "label": self.env._("Work orders assigned to me"),
            "model": "facility.workorder",
            "icon": "fa-wrench",
            "domain": lambda user, today: [("technician_id", "=", user.id)],
            "urgent": lambda today: [("date_due", "<", today)],
        }]
```

Counts are read with `search_count`, not by loading records: this runs for
everybody, every morning, and the number is all it needs.

**One trap.** Each row carries a full action dict including `views`. The payload
is fetched with an ORM call and handed straight to `doAction`, and only actions
returned from a *button* are normalised server-side — an action without `views`
throws while preprocessing and the row silently does nothing. That shape has
bitten three times in this project, so there is a test asserting it.

## Commercial exposure — *Majal → Reports → Commercial Exposure*

A dashboard of counts answers "how busy are we". This answers "what are we
exposed to", which is the question a board actually asks:

- **Contract value** across live projects.
- **Approved variations**, and what percentage of the contract they represent.
  Above 10% is amber, above 20% is red — a prompt to ask, not a verdict.
- **Retention held** — cash sitting with the client.
- **Certified, not invoiced** — work earned and not yet billed.

Then a banner for variations *submitted and not yet approved*, because exposure
already taken and exposure about to arrive are different questions and a board
asks both. Then **Waiting for a signature**: pending approval steps worst-value
first, with how many days each has been outstanding. That table is the one
thing on the screen anybody can act on this afternoon — everything else is a
consequence of decisions already taken.

Projects are listed by how far variations have moved the contract, not by name
or value, so the job with a problem is at the top.

Closed projects drop out: a board asks about live exposure, and a finished job
is history.
