#!/usr/bin/env bash
# Verify that an OTA publish will bundle the right configuration, and all of it.
#
#   usage: tools/ota/check-env-vars.sh <branch> <environment>
#
# Two checks, both of which have already cost this project a real failure:
#
# 1. BRANCH/ENVIRONMENT PAIRING. `ejazz-ota-preview` shipped with
#    EAS_UPDATE_ENVIRONMENT="production" while publishing to the preview branch.
#    Both environments happened to hold the same variable NAMES, so nothing
#    broke -- it was waiting for one value to diverge, at which point test
#    phones would have quietly received production configuration. The pairing is
#    asserted here so the two can never drift apart silently again.
#
# 2. COMPLETENESS. Every name in required-public-vars.txt must resolve to a
#    non-empty value in the target environment. See that file for why.
#
# Values are never printed. Only the variable name and the length of its value
# reach the log, which is enough to tell "set" from "missing" without putting a
# URL or a token in a build log that is kept.
set -euo pipefail

BRANCH="${1:?usage: check-env-vars.sh <branch> <environment>}"
ENVIRONMENT="${2:?usage: check-env-vars.sh <branch> <environment>}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
APP_DIR="$REPO_ROOT/artifacts/ejazz-media-app"
LIST="$HERE/required-public-vars.txt"

echo "--- configuration check: branch=$BRANCH environment=$ENVIRONMENT"

# 1. The pairing. Anything not on this list is a mistake, not a new use case:
#    an update's configuration must match the binaries on the channel it lands on.
case "$BRANCH:$ENVIRONMENT" in
  preview:preview|production:production|development:development) : ;;
  *)
    echo "REFUSING: branch '$BRANCH' must publish with environment '$BRANCH', not '$ENVIRONMENT'."
    echo "An update whose EXPO_PUBLIC_* values come from a different environment"
    echo "than the installed binaries' would silently reconfigure the app."
    exit 1
    ;;
esac
echo "ok      branch and environment agree"

# 2. Completeness. Read the manifest, dropping comments and blank lines.
if [ ! -f "$LIST" ]; then
  echo "REFUSING: $LIST is missing. Nothing was published."
  exit 1
fi
VARS="$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$LIST" | grep -v '^$' || true)"
if [ -z "$VARS" ]; then
  echo "REFUSING: no variables listed in $LIST. Nothing was published."
  exit 1
fi

# Guard the names before they are interpolated into a shell command below.
# A malformed entry must fail loudly here, not produce a surprising expansion.
for V in $VARS; do
  case "$V" in
    [A-Za-z_][A-Za-z0-9_]*) : ;;
    *) echo "REFUSING: '$V' in $LIST is not a valid variable name."; exit 1 ;;
  esac
done

# `eas env:exec` runs the command with the environment's variables loaded, which
# is exactly what the bundler will see -- so this tests the real thing rather
# than a listing of what someone believes is configured. --include-sensitive is
# deliberately NOT used anywhere: presence and length are all that is needed.
INNER='missing=0; for V in '"$(echo "$VARS" | tr "\n" " ")"'; do eval "x=\${$V:-}"; if [ -n "$x" ]; then printf "ok      %s (%s chars)\n" "$V" "${#x}"; else printf "MISSING %s\n" "$V"; missing=1; fi; done; exit $missing'

cd "$APP_DIR"
OUT=""
STATUS=0
OUT="$(eas env:exec "$ENVIRONMENT" "$INNER" 2>&1)" || STATUS=$?
echo "$OUT" | grep -E '^(ok|MISSING) ' || true

# Belt and braces: trust neither the exit code alone nor the output alone.
# eas env:exec wrapping a failing command has not been load-bearing here before.
if [ "$STATUS" -ne 0 ] || echo "$OUT" | grep -q '^MISSING '; then
  echo
  echo "REFUSING: the '$ENVIRONMENT' EAS environment is missing a required"
  echo "EXPO_PUBLIC_* variable listed in required-public-vars.txt."
  echo
  echo "Publishing anyway would ship a bundle in which that value is undefined."
  echo "The app would not crash and nothing would report an error -- the feature"
  echo "reading it would simply stop working for every user on this channel."
  echo "Add it on expo.dev (Project settings -> Environment variables) and start"
  echo "this workflow again. Nothing was published."
  if [ "$STATUS" -ne 0 ] && ! echo "$OUT" | grep -q '^MISSING '; then
    echo
    echo "eas env:exec itself failed (exit $STATUS). Its output:"
    echo "$OUT"
  fi
  exit 1
fi

echo "ok      every required EXPO_PUBLIC_* is set in '$ENVIRONMENT'"
