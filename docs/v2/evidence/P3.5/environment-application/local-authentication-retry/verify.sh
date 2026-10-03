#!/usr/bin/env bash
# Read-only post-installer acceptance checks for the local authentication retry.
#
# Nothing here builds, launches the app, captures audio, opens a microphone,
# loads a model, touches a database, calls pactl, sends input or touches the
# network. The only commands are: node --version, command -v, pacman -Q,
# gst-inspect-1.0 and test -x.
#
# The `step 0 prereq read` block is extracted verbatim from
# ../environment-proposal-repair2/verify.mjs (the fail-closed STEP-0 form,
# IR2-01): `set -e`, `command -v … || { …; exit 1; }`, one `gst-inspect-1.0`
# per element for appsink autoaudiosrc alsasrc pulsesrc, and the scanner
# asserted with `test -x`, not `test -f`.
#
# Exit status is this script's own; each check asserts its own exit.
set -u
failures=0
ok()   { printf 'PASS %s\n' "$1"; }
bad()  { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

# --- exit 0 of the owner-local pkexec installer ------------------------------
status_file=build/p3.5-auth/exit.status
if [ -f "$status_file" ]; then
  st=$(cat "$status_file")
  if [ "$st" = "0" ]; then ok "installer exit status is 0"
  else bad "installer exit status is $st (expected 0)"; fi
else
  bad "installer exit status file missing"
fi

# --- exact three approved packages installed --------------------------------
for p in gst-plugins-base gst-plugins-good patchelf; do
  if pacman -Q "$p" >/dev/null 2>&1; then
    v=$(pacman -Q "$p" 2>/dev/null)
    ok "pacman -Q $p installed — $v"
  else
    bad "pacman -Q $p reports not installed"
  fi
done

# --- STEP-0 prereq read, fail-closed (verbatim from verify.mjs) --------------
step0=$(bash <<'STEP0' 2>&1
set -e
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node --version
command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }
  echo "OK $e"
done
test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner || { echo "FAIL: scanner missing or not executable"; exit 1; }
echo "scanner present"
echo "STEP-0 PASS: prerequisites satisfied"
STEP0
)
step0_status=$?
printf '%s\n' "$step0"
if [ "$step0_status" -eq 0 ] && printf '%s' "$step0" | grep -q 'STEP-0 PASS'; then
  ok "STEP-0 prereq read exits 0 and prints STEP-0 PASS"
else
  bad "STEP-0 prereq read exit $step0_status"
fi

for e in appsink autoaudiosrc alsasrc pulsesrc; do
  if printf '%s\n' "$step0" | grep -qx "OK $e"; then ok "gst-inspect-1.0 $e visible (separate read)"
  else bad "gst-inspect-1.0 $e not confirmed"; fi
done

if [ "$failures" -eq 0 ]; then printf 'ALL CHECKS PASS\n'; exit 0; fi
printf '%s CHECK(S) FAILED\n' "$failures"; exit 1