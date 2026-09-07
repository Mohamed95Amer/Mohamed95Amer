"""Values a remote caller cannot forge.

The document and sheet write guards used to stand down for any truthy value
under their context key — `majal_document_transition=True` was enough. Context
travels with an RPC call, so anybody with write access on a document could set
that key and write `state`, `approved_by_id` or `approval_checksum` directly,
which skips the workflow entirely and forges an approval trail. The sheet guard
had the same shape over `state`, `revision`, `checksum` and `frozen_by_id`.

The fix is the one already used for approvals in
construction_base/models/approval_mixin.py: compare against a private object by
identity. RPC can only deliver JSON, so a context value arriving from outside
can never *be* one of these — a caller can send the string, the number or the
boolean, and none of them are this object. Server-side callers import the
constant and pass it.

Two objects rather than one, named for what each unlocks: a reference that
somehow leaks from the document workflow still cannot unfreeze a sheet.

This module deliberately depends on nothing. It is imported by the models it
guards, and a guard that can fail to import is not a guard.
"""

DOCUMENT_TRANSITION = object()
SHEET_TRANSITION = object()
