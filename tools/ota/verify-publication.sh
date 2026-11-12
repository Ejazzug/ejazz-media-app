#!/usr/bin/env bash
# Publish an update, then prove it actually landed and say exactly what landed.
#
#   usage: tools/ota/verify-publication.sh <branch> <environment> <message>
#          tools/ota/verify-publication.sh --parse-only <file.json>
#   env:   CURRENT_FINGERPRINT  optional; set by check-fingerprint.sh. When
#                               present, the published runtime must equal it.
#
# WHY THIS EXISTS. The previous version of these workflows ran `eas update` and
# then printed `eas update:list`, and nobody read either closely. On 2026-11-12
# the same test update was published TWICE, sixteen minutes apart, and the
# duplicate went unnoticed because the command had reported success both times.
# A publish step should not merely exit 0 -- it should state the group ID,
# runtime, platform, branch and commit, and then confirm from the server that
# what it named is what is at the head of the branch.
#
# --parse-only runs the assertions against a saved publish result and publishes
# nothing, so the parser can be tested without sending anything to a phone.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../../artifacts/ejazz-media-app" && pwd)"

# The parser. eas-cli prints an "Environment variables ... loaded" banner on
# STDOUT even with --json, so JSON.parse on the whole stream throws; skip to the
# first bracket. Verified 2026-11-12.
parse_and_report() {
  node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(process.argv[1], "utf8");
    const i = raw.indexOf("[");
    if (i < 0) { console.error("REFUSING: no JSON array in the publish result."); process.exit(1); }
    let rows;
    try { rows = JSON.parse(raw.slice(i)); }
    catch (e) { console.error("REFUSING: could not parse the publish result: " + e.message); process.exit(1); }

    const a = (rows || []).find(r => r && r.platform === "android");
    if (!a) {
      console.error("REFUSING: the publish result contains no android update group.");
      console.error("Platforms present: " + JSON.stringify((rows||[]).map(r => r && r.platform)));
      process.exit(1);
    }

    const want = process.env.CURRENT_FINGERPRINT || "";
    if (want && a.runtimeVersion !== want) {
      console.error("REFUSING: published runtime " + a.runtimeVersion +
                    " is not the one this commit fingerprints to (" + want + ").");
      console.error("No installed binary would accept it.");
      process.exit(1);
    }

    // iOS groups are strays: no iOS binary of this app exists, and the iOS
    // fingerprint differs from the android one, so such a group matches nothing.
    // Not fatal -- just noise worth naming so it is not mistaken for coverage.
    const ios = (rows || []).filter(r => r && r.platform === "ios");
    console.log("PUBLISHED");
    console.log("  group     " + a.group);
    console.log("  update    " + a.id);
    console.log("  runtime   " + a.runtimeVersion);
    console.log("  platform  " + a.platform);
    console.log("  branch    " + a.branch);
    console.log("  commit    " + (a.gitCommitHash || "(none recorded)"));
    console.log("  message   " + JSON.stringify(a.message));
    console.log("  rollback  " + (a.isRollBackToEmbedded ? "yes" : "no"));
    if (ios.length) {
      console.log("  note      " + ios.length + " stray ios group(s) also created; " +
                  "pass --platform android to avoid them");
    }
    // Hand the group ID back for the head-of-branch confirmation below.
    fs.writeFileSync(process.argv[2], a.group + "\n");
  ' "$1" "$2"
}

if [ "${1:-}" = "--parse-only" ]; then
  FILE="${2:?usage: verify-publication.sh --parse-only <file.json>}"
  TMPGROUP="$(mktemp)"
  trap 'rm -f "$TMPGROUP"' EXIT
  parse_and_report "$FILE" "$TMPGROUP"
  echo "parse-only: assertions passed, nothing was published"
  exit 0
fi

BRANCH="${1:?usage: verify-publication.sh <branch> <environment> <message>}"
ENVIRONMENT="${2:?usage: verify-publication.sh <branch> <environment> <message>}"
MESSAGE="${3:?usage: verify-publication.sh <branch> <environment> <message>}"

cd "$APP_DIR"
RESULT="$(mktemp)"
TMPGROUP="$(mktemp)"
trap 'rm -f "$RESULT" "$TMPGROUP"' EXIT

echo "--- publishing to '$BRANCH' with environment '$ENVIRONMENT'"
echo "message: $MESSAGE"

# --platform android, always. There is no iOS binary of this app, and the iOS
# fingerprint differs, so an iOS group would match nothing and only clutter the
# branch history.
#
# --clear-cache IS NOT OPTIONAL, and it is the least obvious line in this file.
# `process.env.EXPO_PUBLIC_*` is inlined by babel at transform time, and Metro's
# transform cache is NOT keyed on the values of those variables. So a bundle can
# be built from a warm cache carrying configuration that is no longer true,
# while every other guard here passes: check-env-vars.sh proves the EAS
# environment is right, the fingerprint proves the native side is right, and
# neither says anything about what actually got compiled in.
#
# Verified 2026-11-12, minutes after EXPO_PUBLIC_PULSE_API_URL was added to the
# EAS environments. An export run under `eas env:exec preview` produced a bundle
# with no control.ejazzug.com in it (5,002,599 bytes, served from
# /tmp/metro-cache); the same export with the cache cleared produced a different
# bundle (5,004,143 bytes) that contained it. Publishing the first one would
# have shipped Pulse silently disabled -- the exact failure the environment
# check was written to prevent, one layer further down.
#
# Codemagic clones fresh and caches only ~/.pnpm-store, so its cache is cold
# today and this flag changes nothing there. It matters when publishing from a
# machine with a warm cache, and it would matter in CI the moment someone adds a
# Metro cache path to cache_paths as a build-speed optimisation. The cost is one
# full rebuild per publish, which is the right price for knowing what shipped.
eas update \
  --branch "$BRANCH" \
  --platform android \
  --clear-cache \
  --environment "$ENVIRONMENT" \
  --message "$MESSAGE" \
  --non-interactive \
  --json > "$RESULT"

parse_and_report "$RESULT" "$TMPGROUP"
GROUP="$(cat "$TMPGROUP")"

# Confirm from the SERVER that the group just named is at the head of the branch,
# rather than trusting the publish command's own account of itself.
echo
echo "--- confirming it is at the head of '$BRANCH'"
HEAD_OUT="$(eas update:list --branch "$BRANCH" --limit 3 --non-interactive 2>&1)"
echo "$HEAD_OUT"
if ! echo "$HEAD_OUT" | grep -q "$GROUP"; then
  echo
  echo "WARNING: group $GROUP is not among the 3 newest groups on '$BRANCH'."
  echo "The publish reported success, so check the channel by hand before"
  echo "assuming this update will be served."
  exit 1
fi
echo
echo "ok      group $GROUP is live on '$BRANCH'"
