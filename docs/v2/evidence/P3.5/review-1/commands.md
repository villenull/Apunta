# review-1 — exact commands, working directories and exits

No app, server, database, build, real model, audio, microphone, display,
download, install, network, live folder or port 7717 was used.

| # | Command (cwd) | Exit | Output / purpose |
| --- | --- | --- | --- |
| 1 | `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --version` (repo) | 0 | `v24.19.0` |
| 2 | `PATH="$HOME/.cargo/bin:$PATH" cargo test permissions --offline --quiet` (`src-tauri`) | 0 | `running 5 tests … test result: ok. 5 passed; 0 failed` |
| 3 | `node build/p3.5-review1/source-outputs-mapping.mjs` (repo) | 0 | D1 reproduced (see `source-outputs-mapping.md`) |
| 4 | `node build/p3.5-review1/stale-rectangle.mjs` (repo) | 0 | D2 reproduced (see `stale-rectangle.md`) |
| 5 | `gst-inspect-1.0 appsink` | 0 | `AppSink` present |
| 6 | `gst-inspect-1.0 autoaudiosrc` | 255 | absent |
| 7 | `gst-inspect-1.0 alsasrc` | 255 | absent |
| 8 | `gst-inspect-1.0 pulsesrc` | 255 | absent |
| 9 | `gst-inspect-1.0 pipewiresrc` | 0 | present |
| 10 | `pacman -Qo /usr/bin/pactl` | 0 | `libpulse 17.0+r98+gb096704c0-1` |
| 11 | `pacman -Ql gst-plugins-base-libs \| grep gstreamer-1.0/libgstapp` | 0 | `libgstapp.so` owned by base-libs |
| 12 | `objdump -d /usr/bin/pactl \| grep 11763` | 0 | short-format string referenced at `0xafdd`, `0xb9cd` |
| 13 | `objdump -d --start-address=0xb960 --stop-address=0xba40 /usr/bin/pactl` | 0 | source-output short columns |
| 14 | `strings -t x /usr/bin/pactl` / `objdump -s -j .rodata` | 0 | `%u\t%u\t%s\t%s\t%s` at `0x11763`; `"%u"` at `0x114dd` |
| 15 | `objdump -d --start-address=0x4017c0 --stop-address=0x401930 "…/AppRun.wrapped"` | 0 | unconditional `GST_PLUGIN_SYSTEM_PATH_1_0` |
| 16 | `git diff --name-only 8783181..46419f5` | 0 | scope: card paths + docs only |
| 17 | `git grep -c 'console\.' 46419f5 -- 'docs/v2/evidence/P3.4/**/*.mjs'` | 0 | 30 console sites in 7 committed P3.4 scratch files (LINT1) |
| 18 | `grep -nE 'no-console' eslint.config.js` | 0 | `no-console` off only for `scripts/**`, `tools/model-lab/**`, `**/__fixtures__/**` |

The full 4,000+ lines of `pactl`/`AppRun.wrapped` disassembly are not committed
(they are reproducible with commands 12-15). The two synthetic scripts are
committed beside this file.
