# Commands run for the AM-193 authentication diagnosis (read-only)

All commands were read-only. No privileged command, no auth attempt, no
credential/PTY/environment capture. Exit codes noted where meaningful.

| # | Command (abridged) | Exit | Purpose |
| --- | --- | --- | --- |
| 1 | `ls -la docs/v2/evidence/P3.5/environment-application/` | 0 | locate prior evidence |
| 2 | `git status --short` / `git branch --show-current` / `git log --oneline -5` | 0 | confirm `main`, untracked prior README |
| 3 | `cat build/p3.5-auth/install-in-terminal.sh` | 0 | confirm approved script form |
| 4 | `cat build/p3.5-auth/exit.status` (`od -c`, `stat -c %y`) | 0 | value `124`, mtime `08:05:12.357` |
| 5 | `man 1 pkexec` (AUTHENTICATION AGENT) | 0 | internal textual-agent fallback, no `--disable-internal-agent` |
| 6 | `ps -o pid,ppid,sid,pgid,tty,stat,comm -p 2419085,2419118` | 0 | controlling tty + session state |
| 7 | `ps -eo pid,ppid,sid,pgid,tty,stat,comm` (filtered) | 0 | host PID namespace visible |
| 8 | `loginctl list-sessions` / `show-session 1,2` | 0 | setsid created no new logind session |
| 9 | `journalctl --since 08:00 --until 08:12 -t polkitd -o short-iso` | 0 | `FAILED to authenticate`, session 2 |
| 10 | `journalctl … -u 'polkit-agent-helper*' -o short-iso` | 0 | helper start 08:02:12, fail 08:05:12 (+180 s) |
| 11 | `man 1 timeout` (`-f, --foreground`) | 0 | documented "cannot read from the TTY" hazard |
| 12 | `timeout --version` | 0 | GNU coreutils 9.11 |
| 13 | `ldd /usr/bin/pkexec` | 0 | links `libpolkit-agent-1.so.0` |
| 14 | `strings /usr/lib/libpolkit-agent-1.so.0` | 0 | controlling-terminal prompt/read paths |
| 15 | `ls /usr/lib/polkit-1/` and agent paths / autostart | 0 | no graphical agent installed |
| 16 | `ps -eo pid,comm` filtered for polkit | 0 | only `polkitd` (1050) running |

Forbidden actions deliberately **not** run: `pkexec`, `pacman`, `sudo`, any
Ghostty launch, any PTY/`script` capture, any environment dump.
