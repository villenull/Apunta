# Coordinator integration note

The author checker used mutable HEAD for its before-config. Root ran 41 checks
PASS before commit, then pinned those two git reads to c8abfc5 so the same
verification remains reproducible after config integration. This changes no
config/assertion/fixture and is independently reviewed with the application.
Original author output describes HEAD at author execution; it is retained.

Installer AM-190 first graphical authentication timed out exit124 without
package execution. A second invocation repeats the exact same authorized command.
No new package, attempt4, or distribution approval is inferred.

## E-1 integration correction

Independent application review found that the original working-tree scope row
required the config to remain dirty. It fails at clean HEAD (40 PASS/1 FAIL),
although the one-key config application is CLEAR. Root corrected that single
scope row to inspect the immutable c8abfc5..507c026 application diff under the
same six feature roots. It still requires exactly the shipping config path.
Other assertions are retained; original41/41 pre-commit output remains historical.
The current working-tree config is still compared to the pinned pre-config and
validated, so the committed scope proof is not a replacement for config checks.
