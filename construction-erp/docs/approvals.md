# Approvals

How a document gets signed off, who decides, and why it is built this way.

## The problem it was built for

Every module in this suite had grown its own approve button. Fourteen of them,
each a state field and a `groups="…"` attribute in a view. Two things were
wrong with that, and the second is serious.

**A threshold could not be expressed at all.** A variation of five thousand and
one of five million took the same single click from the same person. There was
nowhere to say "above a quarter of a million, the board signs".

**The rule was a UI instruction.** `groups` on a button hides the button. It
does not stop the method being called. Write access on bills and variations
belongs to the commercial group, so a quantity surveyor — the person who writes
the bill — could approve the bill. This was not theoretical; it was verified by
creating a commercial-only user and calling the method:

```
GROUPS pm? False | commercial? True
RESULT approved by a non-PM: approved          ← a bill of quantities
CO approved by non-PM: approved | value 197400 ← a variation order
```

## How it works now

A document becomes approvable by inheriting `construction.approvable` and
answering two questions: what it is worth (`_approval_amount`) and what kind it
is (`_approval_kind`).

A **rule** matches a model, optionally a kind and a project, and a band of
value, to a chain of **steps**. Requesting approval creates a **request** with
one step per signature. Each step is a record, which is what makes a single
inbox across fourteen document types possible: "waiting on me" is a query over
steps, not a tour of every model.

### The controls

- **The check is in the method.** `_check_approved()` is called from
  `action_approve` itself, so the rule holds wherever the call comes from — a
  button, a script, the RPC console, or a screen nobody has written yet.
- **Segregation of duties.** `require_other_user` (on by default) stops the
  person who raised the document from signing it. Turn it off where it does not
  apply — a daily log approved by the person who wrote it is normal.
- **Order.** A step cannot be signed while an earlier one is outstanding, so a
  chain cannot be signed from the bottom up.
- **A reason is required to reject.** A rejection without one guarantees a
  second cycle.
- **Refusals explain themselves.** "Project manager has to approve this first"
  and "You raised this, so somebody else has to approve it" — not "access
  denied", which teaches nobody what to do next.

### Delegation

Somebody goes on leave and approvals stop; the usual field fix is to share a
login, which destroys the audit trail exactly where it matters. A delegation
names who is covering and for how long, the delegate's inbox fills with the
approver's outstanding steps, and each signature records **whose authority was
used** — `decided_by` and `delegated_from` are separate fields.

### What happens when the last step signs

The document's `_on_approval_granted` hook runs, and it runs **elevated**. The
approver's authority is to decide, not necessarily to edit: a board member
signing a large variation has no business holding write access to bills of
quantities, and requiring it would defeat the separation the rules exist to
create. This was found by a test, where a delegate with only site-engineer
rights approved a bill and the callback failed on write access.

## Configuring it

*Configuration → Approval Rules*. The demo data ships a delegation of authority
worth copying:

| Document | Band | Signatures |
|---|---|---|
| Variation | up to 50,000 | Project manager |
| Variation | 50,000 – 250,000 | Project manager, then commercial manager |
| Variation | above 250,000 | Project manager, commercial manager, board |
| Bill of quantities | any | Commercial review, then project manager |

Bands are inclusive at the bottom and exclusive at the top, so 0–50,000 and
50,000–250,000 meet exactly once: fifty thousand belongs to the upper band.

A rule naming a project beats a company-wide one, and a rule naming a kind
beats one covering every kind — so a job with an unusual delegation of
authority gets its own rules without disturbing the others.

### A trap worth knowing

The construction groups **imply** one another: manager implies project manager
implies site engineer. A step assigned to the project-manager group can
therefore be signed by anyone more senior, which is usually what you want.
Where it is not — where "the board signs, and only the board" — name a specific
person on the step rather than a group that others inherit.

## What is deliberately not here

- **No rule means no approval.** A suite that refused to work until somebody
  had written rules would only get the rules written badly and in a hurry, so
  a document no rule covers keeps the old behaviour.
- **No approve-by-reply.** The WhatsApp alert carries the document and the
  value and links into an authenticated session. A token in a message body that
  approves a quarter-million variation is a signature anybody who sees the
  phone can forge.
- **Not every model is wired up yet.** Bills of quantities and variation orders
  are, because that is where the money is. Progress claims, permits, submittals,
  daily logs and inspections still use their own buttons; moving them across is
  a matter of inheriting the mixin and calling `_check_approved()`.
