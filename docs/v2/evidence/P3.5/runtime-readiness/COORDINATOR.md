# Coordinator checkpoint ownership decision

Independent readiness CLEAR is accepted. Its root-append requirement follows the
initial writer assignment, not a protected acceptance rule. For final runtime,
root delegates cards/P3.5.json exclusively to the runtime worker (already in May
edit), suspending root writes until return. This avoids a handoff stall and records
each durable capture record/anchor as the card prescribes. Worker appends exact
RECORD/run-folder data, preserves all history, attempt3 and original assertions;
V5 still sees three ordered current records with matching anchors or fails closed.
No parallel checkpoint writer or independent freshness claim is introduced.

Dispatch regenerated at runtime anchor888bcc4/attempt3/port7837. Original source
base8783181 and CLEAR candidate7e16513 remain unchanged as implementation history.
No runtime row or resource reservation executed by readiness preparation. P3.4
runtime worker d353b075 owns the build lease until confirmed cleanup/release.
