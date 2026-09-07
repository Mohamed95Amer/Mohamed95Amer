"""Values a remote caller cannot forge.

Same reasoning as majal_documents/models/transitions.py, for the two guards
that live in this module. Both used to accept any truthy context value, so an
RPC caller holding write access could set the key and write an approval
decision — approved_by_id, approved_date, approval_state — straight onto a
project document or a drawing revision, skipping the workflow that is supposed
to record who signed what.

Separate objects per guard, named for what each unlocks, so a reference that
escapes one workflow cannot open the other.
"""

PROJECT_DOCUMENT_TRANSITION = object()
DRAWING_TRANSITION = object()
