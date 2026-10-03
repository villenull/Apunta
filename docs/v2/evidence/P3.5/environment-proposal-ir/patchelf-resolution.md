# IR evidence — does linuxdeploy supply `patchelf` to the GStreamer plugin?

Read-only. No app, server, database, build, install, download, network,
microphone, audio, display or port 7717 was used. Everything below is from
files already on this machine and from local binaries that were read, not run
as a build.

The proposal's **U-1** says `patchelf` is absent and that whether `linuxdeploy`
supplies its own on the plugin's `PATH` was not established. This evidence
settles it: **it does not.** `linuxdeploy` bundles `patchelf`, but it uses it
internally and never puts it on the plugin's `PATH`. On this host the plugin
script therefore exits `2` before it copies anything.

## 1. The script the bundler runs exits 2 without `patchelf`

The Tauri CLI embeds the `linuxdeploy-plugin-gstreamer.sh` script verbatim and
writes it to `~/.cache/tauri/linuxdeploy-plugin-gstreamer.sh`. Extracting the
embedded copy's lines of four or more characters (the default `strings(1)`
minimum; `strings` drops the short lines `fi`, `}`, `EOF` and all blank lines)
gives **122 of 122 lines identical** to the cached file:

```
$ python3 - <<'PY'
cached = open('/home/villenull/.cache/tauri/linuxdeploy-plugin-gstreamer.sh').read().splitlines()
emb = open('/tmp/opencode/cli-strings.txt').read().splitlines()[13132:13254]
...
PY
cached lines >=4: 122 | embedded lines >=4: 122
content diffs: 0 | length delta: 0
cached short lines dropped by strings(1): ['fi', '}', 'fi', 'fi', 'fi', 'fi', 'fi', 'fi', 'EOF', 'EOF', 'fi']
```

Both copies begin with:

```sh
if ! which patchelf &>/dev/null && ! type patchelf &>/dev/null; then
    echo "Error: patchelf not found"
    ...
    exit 2
fi
```

So the plugin requires `patchelf` **on `PATH`**. It does not read `$PATCHELF`.

## 2. `linuxdeploy` bundles `patchelf`, but resolves it itself

The linuxdeploy AppImage is an ELF runtime with a zstd squashfs appended at
`shoff + shnum*shentsize = 944632`. `unsquashfs` and `7z` are absent, so the
listing was produced by `squashfs-list.py` (in this directory), which parses
the superblock, inode table and directory table and shells out to `zstd` to
decompress metadata blocks:

```
$ python3 docs/v2/evidence/P3.5/environment-proposal-ir/squashfs-list.py \
    ~/.cache/tauri/linuxdeploy-07333c6-x86_64.AppImage
# squashfs v4.0 comp=zstd inodes=58 bytes_used=18863269
...
FILE /usr/bin/linuxdeploy
FILE /usr/bin/patchelf          <-- bundled
FILE /usr/bin/strip
```

Reading the extracted `/usr/bin/linuxdeploy` (3,492,312 bytes) shows how it
finds that copy. It contains the strings

```
PATCHELF
Using patchelf specified in $PATCHELF:
Could not find patchelf: no such file:
Using patchelf:
Call to patchelf failed:
```

and at `0x490057` it calls `getenv("PATCHELF")`; when that is unset it does
`readlink("/proc/self/exe")` (string at `0x6a3661`), takes its directory, and
appends the literal `patchelf` (`movabs $0x666c656863746170` at `0x4904a2`).
So it uses `$PATCHELF` or `<dir of linuxdeploy>/patchelf`. Neither puts a
`patchelf` on a child's `PATH`.

## 3. `linuxdeploy` never writes `PATH`

Every reference to the literal `PATH` (`0x6a605d`) in the linuxdeploy binary is
a `getenv` call (`call 0x5f7d60`):

```
$ grep -n "# 0x6a605d" ld-dis.txt
  4505f0 ... call 0x5f7d60      # PATH search helper
  4905bd ... call 0x5f7d60      # patchelf resolution
  4965ce ... call 0x5f7d60      # plugin search
  50df5a ... call 0x5f7d60
  65be58 ... call 0x5f7d60
```

There is no `setenv`/`putenv` of `PATH` and no `movl`/`movabs` immediate for
`PATH` (`grep "48544150"` → 0 hits). The plugin runner builds a child
environment that adds `LINUXDEPLOY` — the name is built at `0x49f3ab` from
`movabs "LINUXDEP"` plus `movl "PLOY"`, which is why `strings` alone does not
show it — but it never adds a `PATH` entry.

## 4. The AppImage runtime does not set `PATH` either

The runtime's `setenv` calls (`call 0x75115`) pass only `HOME`,
`XDG_CONFIG_HOME`, `FUSERMOUNT_PROG`, `APPIMAGE`, `ARGV0`, `APPDIR`, `OWD` and
`_FUSE_COMMFD`. It has no standalone `usr/bin` string (the only occurrence is
the `/usr/bin` tail of the default `PATH` literal at `0x8b41a`), so it does not
prepend `$APPDIR/usr/bin` to `PATH`.

## 5. Host facts

```
$ which patchelf            -> exit 1 (absent)
$ pacman -Q patchelf        -> exit 1, "package 'patchelf' was not found"
$ pacman -Si patchelf       -> Repository: extra; Version: 0.19.1-1;
                               Licenses: GPL-3.0-or-later; Download Size: 122.98 KiB
```

## Conclusion

The GStreamer plugin runs with the `PATH` it inherits from `linuxdeploy`, which
inherits it from the Tauri CLI; the AppDir's `usr/bin` (holding the bundled
`patchelf`) is not on it, and the host has no `patchelf`. The plugin therefore
prints `Error: patchelf not found` and exits `2`, and the AppImage build fails
before any plugin is copied. This is not a benign "unknown to settle by the
trial build": the trial build is the thing that fails, and it fails before the
grant can produce any evidence. The minimal prerequisite is `patchelf`
(`extra/0.19.1-1`), installed by the owner-run `pkexec` command alongside the
GStreamer packages.
