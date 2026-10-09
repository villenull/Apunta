#!/bin/bash
#
# P6.2 — build, sign and stage a Linux release, on this PC.
#
#   bash scripts/v2/release-linux.sh              # build, sign, tag, draft release
#   bash scripts/v2/release-linux.sh --no-upload  # build and sign only; nothing leaves this PC
#
# Run it yourself, in your own terminal: it asks for the updater key's
# password, and nothing else may see it. The password goes only into the
# environment of the one `tauri build` that signs, and the private key never
# leaves this PC (owner decision 2026-10-09, instead of GitHub secrets).
#
# What it does, in order, stopping at the first thing wrong:
#   1. checks the checkout: on main, clean, identical to origin/main, every
#      version field equal, the tag not taken, the key present, gh signed in;
#   2. builds the runtime bundle and the production AppImage (`npm run
#      tauri:build`), runs `npm run check:release`, and signs the AppImage
#      with `tauri signer sign`, which writes the `.sig` installed apps verify;
#   3. writes `latest.json` — the file installed apps read — and checks it
#      with scripts/v2/check-manifest.mjs;
#   4. tags the commit, pushes the tag, and creates a DRAFT GitHub release
#      with the AppImage, its signature and latest.json.
#
# A draft is visible only to the repository's owner. Installed apps see the
# release only once you press Publish on GitHub: `releases/latest` never
# resolves to a draft.

set -euo pipefail

UPLOAD=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    *)
      printf 'usage: %s [--no-upload]\n' "$0" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
KEY="${APUNTA_SIGNING_KEY:-$HOME/.apunta-signing/apunta-updater.key}"
NODE_BIN="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin"
REPOSITORY="villenull/Apunta"

step() { printf '\n== %s\n' "$1"; }
die() {
  printf '\nrelease-linux: %s\n' "$1" >&2
  exit 1
}

[ -x "$NODE_BIN/node" ] || die "the pinned Node 24.19.0 is not at $NODE_BIN (docs/RECOVERY.md)"
export PATH="$NODE_BIN:$PATH"

step "Checking the checkout"
VERSION="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json","utf8")).version')"
TAG="v$VERSION"
for manifest in package.json server/package.json web/package.json shared/package.json installer/package.json; do
  found="$(node -p "JSON.parse(require('fs').readFileSync('$manifest','utf8')).version")"
  [ "$found" = "$VERSION" ] || die "$manifest says $found, but tauri.conf.json says $VERSION"
done
grep -q "^version = \"$VERSION\"$" src-tauri/Cargo.toml || die "src-tauri/Cargo.toml is not at $VERSION"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "not on main"
[ -z "$(git status --porcelain)" ] || die "the working tree is not clean; commit or stash first"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "HEAD is not origin/main; push or pull first"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || [ -n "$(git ls-remote --tags origin "$TAG")" ]; then
  die "the tag $TAG already exists; bump the version first"
fi
[ -f "$KEY" ] || die "the updater's private key is not at $KEY (docs/RECOVERY.md)"
if [ "$UPLOAD" = 1 ]; then
  gh auth status >/dev/null 2>&1 || die "gh is not signed in (gh auth login)"
fi
printf 'version %s, commit %s\n' "$VERSION" "$(git rev-parse --short HEAD)"

# Asked before the long build, so it can run unattended afterwards.
printf '\nPassword for the updater key (%s): ' "$KEY"
read -r -s PASSWORD
printf '\n'
[ -n "$PASSWORD" ] || die "no password given"

step "Building the runtime bundle"
bash scripts/v2/package-linux-resources.sh

step "Building the AppImage"
npm run tauri:build

step "Checking the release binary"
npm run check:release

BUNDLE="src-tauri/target/release/bundle/appimage"
NAME="Apunta_${VERSION}_amd64.AppImage"
[ -f "$BUNDLE/$NAME" ] || die "the build left no $BUNDLE/$NAME"

step "Signing the AppImage"
# Not the bundler's createUpdaterArtifacts: that needs a plugins.updater block
# in the build config, which makes generate_context! need serde_json as a
# direct crate (A05 admits four). `tauri signer sign` writes the same `.sig`.
rm -f "$BUNDLE/$NAME.sig"
TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PASSWORD" \
  npx tauri signer sign "$BUNDLE/$NAME" >/dev/null
unset PASSWORD
[ -s "$BUNDLE/$NAME.sig" ] || die "signing left no signature at $BUNDLE/$NAME.sig"

OUT="build/release/$TAG"
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$BUNDLE/$NAME" "$BUNDLE/$NAME.sig" "$OUT/"
NOTES="docs/releases/$TAG.md"
[ -f "$NOTES" ] || die "no release notes at $NOTES"

step "Writing latest.json"
node -e '
  const { readFileSync, writeFileSync } = require("node:fs");
  const [out, name, version, tag, notes, repository] = process.argv.slice(1);
  const manifest = {
    version,
    notes: readFileSync(notes, "utf8").trim(),
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms: {
      "linux-x86_64": {
        signature: readFileSync(`${out}/${name}.sig`, "utf8").trim(),
        url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
      },
    },
  };
  writeFileSync(`${out}/latest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
' "$OUT" "$NAME" "$VERSION" "$TAG" "$NOTES" "$REPOSITORY"
node scripts/v2/check-manifest.mjs "$OUT/latest.json" --version "$VERSION"
(cd "$OUT" && sha256sum "$NAME" > SHA256SUMS && cat SHA256SUMS)

if [ "$UPLOAD" = 0 ]; then
  step "Done (nothing uploaded)"
  printf 'staged in %s\n' "$OUT"
  exit 0
fi

step "Tagging $TAG and creating the draft release"
git tag -a "$TAG" -m "Apunta $VERSION"
git push -q origin "$TAG"
gh release create "$TAG" --repo "$REPOSITORY" --draft --verify-tag \
  --title "Apunta $VERSION" --notes-file "$NOTES" \
  "$OUT/$NAME" "$OUT/$NAME.sig" "$OUT/latest.json" "$OUT/SHA256SUMS"

step "Done"
printf 'A draft release is waiting at https://github.com/%s/releases\n' "$REPOSITORY"
printf 'Read it, then press Publish. Installed apps see it only after that.\n'
