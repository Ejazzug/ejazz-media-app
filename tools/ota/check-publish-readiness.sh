#!/usr/bin/env bash
# Everything a publish would be the first thing to exercise -- without publishing.
#
#   usage: tools/ota/check-publish-readiness.sh <branch> <environment> [message]
#
# Run by ejazz-ota-validate after check-env-vars.sh and check-fingerprint.sh.
# Nothing here writes: `eas whoami`, `channel:view` and `update:list` are reads,
# and `expo export` builds the bundle to a temporary directory on the build
# machine and uploads nothing.
#
# WHAT IT IS FOR. Steps 1-8 of the publishing workflow prove the configuration
# and the runtime are right. They do not prove the bundle COMPILES, and a bundle
# that fails to build is the likeliest way a publish dies halfway -- after the
# guards have all passed and reported success. `expo export` is the only check
# that catches that, and it is the reason this script exists rather than the
# validate workflow simply stopping after the fingerprint check.
set -euo pipefail

BRANCH="${1:?usage: check-publish-readiness.sh <branch> <environment> [message]}"
ENVIRONMENT="${2:?usage: check-publish-readiness.sh <branch> <environment> [message]}"
MESSAGE="${3:-(none supplied)}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../../artifacts/ejazz-media-app" && pwd)"
cd "$APP_DIR"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "=============================================================="
echo " publication readiness -- branch '$BRANCH', environment '$ENVIRONMENT'"
echo " NOTHING IS PUBLISHED BY THIS SCRIPT"
echo "=============================================================="
echo

# 1. Who the token is. A permission problem should surface here, named, rather
#    than as a refusal at the publish.
echo "--- 1. token identity and role"
eas whoami
echo

# 2. The channel has to exist and be serving. An update published to a channel
#    that does not exist, or that no installed build uses, is a no-op that
#    reports success -- this project has been bitten by exactly that.
echo "--- 2. target channel"
eas channel:view "$BRANCH" --non-interactive
echo

# 3. What is at the head right now. Also: this is where the operator reads the
#    last-good group ID that section 8 of the runbook says to write down BEFORE
#    publishing, not after something breaks.
echo "--- 3. current head of the branch (note the newest group ID for rollback)"
eas update:list --branch "$BRANCH" --limit 3 --non-interactive
echo

# 4. The bundle must actually build. Run under `eas env:exec` so EXPO_PUBLIC_*
#    is inlined exactly as a real publish would inline it -- a bundle can
#    compile with a value absent and fail with it present, or vice versa.
#
#    --clear IS NOT OPTIONAL. `process.env.EXPO_PUBLIC_*` is inlined by babel at
#    transform time, and Metro's transform cache is not keyed on the VALUES of
#    those variables. Verified 2026-11-12: minutes after
#    EXPO_PUBLIC_PULSE_API_URL was added to the EAS environments, an export run
#    under `eas env:exec preview` still produced a bundle with no
#    control.ejazzug.com in it -- served from /tmp/metro-cache. The same export
#    with --clear produced a different bundle (5,004,143 bytes against
#    5,002,599) that did contain it. Without this flag the check would certify a
#    bundle that is not what a publish would send.
echo "--- 4. bundle compiles (expo export --clear, nothing uploaded)"
eas env:exec "$ENVIRONMENT" \
  "npx --no-install expo export --platform android --clear --output-dir '$OUT/dist'"

BUNDLE="$(find "$OUT/dist" -name '*.hbc' -type f | head -1)"
if [ -z "$BUNDLE" ]; then
  echo
  echo "REFUSING: the export produced no Android Hermes bundle. A publish would"
  echo "have failed here, after every other check had passed."
  exit 1
fi
echo
echo "ok      bundle built: $(basename "$BUNDLE")"
echo "ok      bundle size : $(wc -c < "$BUNDLE") bytes"

# The env being right and the BUNDLE being right are two different claims, and
# the cache gap above is exactly how they come apart. check-env-vars.sh proves
# the first; this proves the second, against the compiled bytecode.
if [ -n "${OTA_ASSERT_BUNDLE_CONTAINS:-}" ]; then
  for NEEDLE in $OTA_ASSERT_BUNDLE_CONTAINS; do
    if grep -qa -- "$NEEDLE" "$BUNDLE"; then
      echo "ok      bundle contains '$NEEDLE'"
    else
      echo
      echo "REFUSING: '$NEEDLE' is not present in the compiled bundle, although"
      echo "the environment check passed. That combination means a stale"
      echo "bundler cache, or a variable the code does not actually read."
      exit 1
    fi
  done
fi
ASSETS="$(find "$OUT/dist/assets" -type f 2>/dev/null | wc -l)"
echo "ok      assets      : $ASSETS"
echo

# 5. What a publish WOULD do, stated plainly, so the operator can compare it
#    against what they intended before running the publishing workflow.
echo "--- 5. a publish from this commit would send:"
echo "      branch      $BRANCH"
echo "      environment $ENVIRONMENT"
echo "      platform    android"
echo "      commit      $(git rev-parse HEAD)"
echo "      subject     $(git log -1 --pretty=%s)"
echo "      message     $MESSAGE"
if [ -n "${CURRENT_FINGERPRINT:-}" ]; then
  echo "      runtime     $CURRENT_FINGERPRINT"
else
  echo "      runtime     (see the fingerprint step above)"
fi
echo
echo "=============================================================="
echo " READY. All checks passed and nothing was published."
echo " To publish for real, run ejazz-ota-preview."
echo "=============================================================="
