#!/usr/bin/env bash
# Record the runtime fingerprint the installed build shipped, so ship.sh can
# answer "OTA or AAB?" exactly instead of guessing from changed paths.
#
#   usage: bash tools/ota/record-shipped-fingerprint.sh              # from this tree
#          bash tools/ota/record-shipped-fingerprint.sh <the.apk>    # from the artifact
#          bash tools/ota/record-shipped-fingerprint.sh --hash <40-hex>
#
# TWO WAYS, because the owner does not always have the APK on a machine with a
# shell. A fingerprint is a pure function of the project files, so computing it
# from the commit Codemagic built gives the same answer as reading it out of
# that build -- provided this tree IS that commit, which is why the commit is
# stamped beside it and ship.sh warns when they have drifted apart.
#
# The APK form is the authoritative one. Use it when in doubt.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="tools/ota/last-shipped-fingerprint.txt"
STAMP="tools/ota/last-shipped-fingerprint.commit"

HASH=""
SOURCE=""
case "${1:-}" in
  --hash)
    HASH="${2:?--hash needs the 40-character value}"
    SOURCE="supplied by hand"
    ;;
  "")
    command -v npx >/dev/null || { echo "REFUSING: npx is not on PATH." >&2; exit 2; }
    [ -n "${EXPO_TOKEN:-}${EAS_ACCESS_TOKEN:-}" ] || {
      echo "REFUSING: no EXPO_TOKEN. On the box: set -a; . /etc/ejazz-eas.env; set +a" >&2; exit 2; }
    echo "computing this tree's fingerprint (production, android)..."
    HASH="$( ( cd artifacts/ejazz-media-app && npx eas fingerprint:generate --platform android \
                 --environment production --json --non-interactive 2>/dev/null ) \
             | python3 -c 'import json,sys
raw=sys.stdin.read(); i=raw.find("{")
print(json.loads(raw[i:]).get("hash","") if i>=0 else "")' )"
    SOURCE="computed from $(git rev-parse --short HEAD)"
    ;;
  *)
    APK="$1"
    [ -f "$APK" ] || { echo "REFUSING: no such file: $APK" >&2; exit 2; }
    HASH="$(unzip -p "$APK" assets/fingerprint 2>/dev/null | tr -d '[:space:]')"
    SOURCE="read out of $(basename "$APK")"
    ;;
esac

HASH="$(printf '%s' "$HASH" | tr -d '[:space:]')"
# A fingerprint is 40 hex characters. Anything else is a mistake worth catching
# here: a wrong value in this file is worse than an empty one, because ship.sh
# would then confidently say "an OTA carries this" when it does not.
case "$HASH" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "REFUSING: '$HASH' is not a 40-character fingerprint ($SOURCE)." >&2; exit 1 ;;
esac

printf '%s\n' "$HASH" > "$OUT"
printf '%s  %s  %s\n' "$(git rev-parse --short HEAD)" "$(date -u +%Y-%m-%dT%H:%MZ)" "$SOURCE" > "$STAMP"
echo "recorded: $HASH"
echo "  $SOURCE"
echo "  -> $OUT"
echo
echo "ship.sh will now say OTA or AAB exactly, instead of guessing from changed paths."
