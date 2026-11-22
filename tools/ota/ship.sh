#!/usr/bin/env bash
# THE ONE COMMAND TO RUN WHEN THE WORK ON THIS BOX IS DONE.
#
#   usage: bash tools/ota/ship.sh [--dry-run] [--from <branch>] [--skip-checks]
#
# Asked for by the owner on 2026-11-23, after an OTA run was rejected by its own
# guard: "i need to automate all these things so that once we're done with
# changes here i get no rejections".
#
# Every rejection that has actually happened on this project is mechanical, and
# every one of them is checked here BEFORE anything is started in Codemagic:
#
#   1. THE COMMITS NEVER LEFT THE BOX. The 2026-11-23 failure. Work was merged
#      into codemagic-release locally and never pushed, so Codemagic checked out
#      the previous head and reported a confirmation mismatch -- which read like
#      a stale variable and was really "that is yesterday's code".
#   2. A STALE OTA_CONFIRM_PRODUCTION. The gate wants the short SHA of HEAD, so
#      the value changes with every publish. This prints the one to paste.
#   3. A versionCode PLAY ALREADY HAS. version-status.sh, which failed two
#      builds in November before it was hardened.
#   4. AN OTA THAT CANNOT CARRY THE CHANGE. The expensive one: a native change
#      (a config plugin, a dependency, app.config) moves the runtime
#      fingerprint, and an OTA published onto an older build is refused -- or
#      worse, accepted by a runtime that lacks the native half. This computes
#      the fingerprint and says plainly which workflow the change needs.
#
# It pushes. That is the point: nothing here is authorised, started or published
# in Codemagic -- the owner does that, and the production gate stays manual.
set -euo pipefail

cd "$(dirname "$0")/../.."
REPO="$PWD"
APP="$REPO/artifacts/ejazz-media-app"
RELEASE_BRANCH="codemagic-release"

DRY=0
FROM="$(git rev-parse --abbrev-ref HEAD)"
SKIP_CHECKS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    --from) FROM="${2:?--from needs a branch}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
refuse() { printf '\nREFUSING: %s\n' "$*" >&2; exit 1; }

[ "$FROM" = "$RELEASE_BRANCH" ] && refuse "run this from the WORK branch, not $RELEASE_BRANCH."

say "1/6  the working tree"
# A dirty tree is the quiet version of failure 1: the change is on the box and
# in nothing that ships.
DIRTY="$(git status --porcelain --untracked-files=no | head -20 || true)"
if [ -n "$DIRTY" ]; then
  echo "$DIRTY"
  refuse "there are uncommitted changes. Commit them, or they will not ship."
fi
echo "clean, on $FROM"

if [ "$SKIP_CHECKS" = "0" ]; then
  say "2/6  the checks a build would fail on"
  ( cd "$APP" && npx tsc --noEmit ) || refuse "the app does not typecheck. A build would fail on this."
  echo "app typecheck     : ok"
  ( cd "$REPO/artifacts/api-server" && npm run --silent build >/dev/null ) \
    || refuse "the api-server does not build."
  echo "api-server build  : ok"
else
  say "2/6  the checks a build would fail on -- SKIPPED (--skip-checks)"
fi

say "3/6  merge into $RELEASE_BRANCH"
git fetch -q origin || true
# What Codemagic would have checked out before this run: the baseline the
# "is this native?" question below is asked against.
BASE="$(git rev-parse "origin/$RELEASE_BRANCH" 2>/dev/null || echo '')"
git checkout -q "$RELEASE_BRANCH"
# A merge, never a reset: the release branch's history is the record of what was
# shipped, and it carries merges nobody made on the work branch.
if ! git merge -q --no-edit "$FROM"; then
  git merge --abort || true
  git checkout -q "$FROM"
  refuse "the merge into $RELEASE_BRANCH conflicts. Resolve it by hand."
fi
HEAD_SHA="$(git rev-parse --short HEAD)"
echo "$RELEASE_BRANCH is now $HEAD_SHA"

say "4/6  push"
if [ "$DRY" = "1" ]; then
  echo "(dry run -- not pushing)"
  AHEAD="$(git rev-list --count "origin/$RELEASE_BRANCH..$RELEASE_BRANCH" || echo '?')"
  echo "would push $AHEAD commit(s) to origin/$RELEASE_BRANCH"
else
  git push -q origin "$RELEASE_BRANCH" "$FROM"
  git fetch -q origin
  REMOTE_SHA="$(git rev-parse --short "origin/$RELEASE_BRANCH")"
  [ "$REMOTE_SHA" = "$HEAD_SHA" ] || refuse "the push did not take: origin is at $REMOTE_SHA, local at $HEAD_SHA."
  echo "origin/$RELEASE_BRANCH = $REMOTE_SHA  (Codemagic will check out exactly this)"
fi
git checkout -q "$FROM"

say "5/6  the versionCode Play would reject"
VSTATUS=0
bash tools/ota/version-status.sh || VSTATUS=$?
case "$VSTATUS" in
  0) ;;
  1) refuse "the next build's versionCode is one Play already has. Fix that before building." ;;
  *) echo "WARNING: the version check could not complete. Treat the number above as unverified." ;;
esac

say "6/6  can an OTA carry this, or does it need a build?"
# THE QUESTION THAT COST A CYCLE on 2026-11-23. Computed, not guessed: a config
# plugin, a dependency or app.config is hashed into the runtime fingerprint, and
# JS published onto a runtime that lacks the native half is the one failure an
# OTA cannot report honestly.
FP=""
if [ -n "${EXPO_TOKEN:-}${EAS_ACCESS_TOKEN:-}" ]; then
  FP="$( ( cd "$APP" && npx eas fingerprint:generate --platform android \
            --environment production --json --non-interactive 2>/dev/null ) \
        | python3 -c 'import json,sys
raw=sys.stdin.read(); i=raw.find("{")
print(json.loads(raw[i:]).get("hash","") if i>=0 else "")' || true)"
fi
LAST_FP_FILE="tools/ota/last-shipped-fingerprint.txt"
LAST_FP="$( { cat "$LAST_FP_FILE" 2>/dev/null || true; } | tr -d '[:space:]')"

echo "this tree's runtime fingerprint : ${FP:-(could not compute -- no EXPO_TOKEN)}"
echo "the one the last build shipped  : ${LAST_FP:-(not recorded yet)}"
NEEDS_BUILD="unknown"
NATIVE_FILES=""
if [ -n "$FP" ] && [ -n "$LAST_FP" ]; then
  if [ "$FP" = "$LAST_FP" ]; then NEEDS_BUILD="no"; else NEEDS_BUILD="yes"; fi
elif [ -n "$BASE" ]; then
  # NO RECORDED FINGERPRINT YET, so fall back to what is being shipped. These
  # are the paths expo-fingerprint hashes: a config plugin, the app config, the
  # dependency set, the build profiles and any committed native project. It is
  # a weaker test than the hash -- it cannot see a transitive dependency moving
  # -- so it only ever says "needs a build", never "an OTA is safe".
  NATIVE_FILES="$( { git diff --name-only "$BASE..HEAD" -- \
      'artifacts/ejazz-media-app/plugins/**' \
      'artifacts/ejazz-media-app/app.config*' \
      'artifacts/ejazz-media-app/package.json' \
      'artifacts/ejazz-media-app/pnpm-lock.yaml' \
      'artifacts/ejazz-media-app/eas.json' \
      'artifacts/ejazz-media-app/android/**' \
      'artifacts/ejazz-media-app/ios/**' 2>/dev/null || true; } | head -10)"
  [ -n "$NATIVE_FILES" ] && NEEDS_BUILD="yes"
fi

cat <<REPORT

------------------------------------------------------------------
WHAT TO START IN CODEMAGIC

REPORT
case "$NEEDS_BUILD" in
  no)
    cat <<REPORT
  The runtime has not moved, so an OTA carries this.

    workflow : ejazz-ota-production
    variable : OTA_CONFIRM_PRODUCTION=$HEAD_SHA
REPORT
    ;;
  yes)
    if [ -n "$NATIVE_FILES" ]; then
      echo "  Native files in this push:"
      echo "$NATIVE_FILES" | sed 's/^/    /'
      echo
    fi
    cat <<REPORT
  A NATIVE CHANGE IS IN HERE. An OTA would be
  refused, and should be: the JS expects native code the installed build
  does not have.

    workflow : ejazz-android-release   (a store build, not an OTA)

  After it is installed, record what it shipped so the next run can tell
  the difference:

    unzip -p <the.apk> assets/fingerprint > $LAST_FP_FILE
REPORT
    ;;
  *)
    cat <<REPORT
  Could not tell. Record a fingerprint once (see below) and this answers
  itself from then on.

    workflow : ejazz-ota-production  -- only if nothing native changed
    variable : OTA_CONFIRM_PRODUCTION=$HEAD_SHA
    native?  : unverified

    unzip -p <the.apk> assets/fingerprint > $LAST_FP_FILE
REPORT
    ;;
esac
echo "------------------------------------------------------------------"
