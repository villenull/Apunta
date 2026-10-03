$ git show 18179fa:docs/v2/evidence/P3.4/output-lint-repair/README.md > old.md
$ git show b457db4:docs/v2/evidence/P3.4/output-lint-repair/README.md > new.md
$ diff <(sed -n '1,203p' old.md) <(sed -n '1,203p' new.md)
203c203
< - Left unstaged and uncommitted for independent review.
\ No newline at end of file
---
> - Left unstaged and uncommitted for independent review.
diff-exit=1 (only the trailing newline on the last line of §7)

$ sed -n '204p' old.md | od -c | tail -2
0000000
$ sed -n '204p' new.md | od -c | tail -2
0000000  \n
0000001
