#!/usr/bin/env bash
# Refuse to publish an update no installed app would accept.
#
#   usage: tools/ota/check-fingerprint.sh <branch> <environment>
#   env:   OTA_EXPECTED_FINGERPRINT   optional; the hash read out of the APK/AAB
#                                     that is actually installed (see below)
#
# With runtimeVersion.policy = "fingerprint" an update is only ever offered to a
# binary whose native fingerprint matches. That is the safety property -- a JS
# update needing a native module an older install lacks reaches nobody instead
# of crashing it. The cost is that a mismatch is a SILENT no-op: the publish
# succeeds, reports success, and no phone ever sees it. For a workflow whose
# entire purpose is to ship a fix, silent success is the worst outcome, so this
# compares the two and refuses rather than letting it pass unnoticed.
#
# Writes CURRENT_FINGERPRINT to $CM_ENV when running under Codemagic, so the
# publish step can assert that what landed carries the runtime it expected.
set -euo pipefail

BRANCH="${1:?usage: check-fingerprint.sh <branch> <environment>}"
ENVIRONMENT="${2:?usage: check-fingerprint.sh <branch> <environment>}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../../artifacts/ejazz-media-app" && pwd)"
cd "$APP_DIR"

# eas-cli prints an "Environment variables ... loaded" banner on STDOUT even with
# --json, so JSON.parse on the whole stream throws and the hash comes back empty.
# Verified 2026-11-12. Skip to the first brace/bracket rather than trusting the
# stream to start with one.
read_hash() {
  node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const i=s.indexOf("{"); console.log(i<0?"":(JSON.parse(s.slice(i)).hash||"")); }
      catch (e) { console.log(""); }
    });'
}
# Pick the newest FINISHED build that lands on the target channel. `--channel`
# looked like the obvious filter but returns nothing for this project -- EAS has
# no channel recorded against these builds, verified 2026-11-12 -- and
# `--build-profile "$BRANCH"` would silently miss a binary built with the
# `preview-aab` or `production-apk` profile. So the channel-to-profile mapping is
# read from eas.json, which is where it is actually defined, and the filtering
# happens here.
read_build_fingerprint() {
  TARGET_CHANNEL="$1" node -e '
    const eas = require("./eas.json");
    const want = process.env.TARGET_CHANNEL;
    const profiles = Object.entries(eas.build || {})
      .filter(([, p]) => p && p.channel === want)
      .map(([name]) => name);
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try {
        const i=s.indexOf("[");
        const rows=i<0?[]:JSON.parse(s.slice(i));
        const mine=(rows||[])
          .filter(b => b && b.status === "FINISHED" && profiles.includes(b.buildProfile))
          .sort((a,b) => String(b.completedAt||"").localeCompare(String(a.completedAt||"")));
        const b=mine[0];
        if (!b) { console.log(""); process.exit(0); }
        console.log(((b.fingerprint||{}).hash)||"");
        console.error("    newest build on channel \"" + want + "\": v" + b.appVersion +
                      " (" + b.appBuildVersion + ") profile=" + b.buildProfile +
                      " built " + String(b.completedAt||"").slice(0,10));
      } catch (e) { console.log(""); }
    });'
}

CURRENT="$(eas fingerprint:generate --platform android \
             --environment "$ENVIRONMENT" --json --non-interactive | read_hash)"

# Scoped to the TARGET CHANNEL, not merely the newest build of any profile.
# Unscoped, a production publish measures itself against whatever was built
# last, which is routinely a preview APK. That comparison happens to pass today
# only because eas.json is hashed as a whole file, so the fingerprint does not
# vary by build profile -- an accident, not a guarantee, and not something to
# rest a production gate on.
LATEST="$(eas build:list --platform android --limit 30 \
            --non-interactive --json | read_build_fingerprint "$BRANCH")"

echo "--- runtime check: branch=$BRANCH"
echo "current project fingerprint        : ${CURRENT:-(could not compute)}"
echo "newest registered build on channel : ${LATEST:-(none recorded on EAS)}"

if [ -z "$CURRENT" ]; then
  echo "REFUSING: could not compute this project's fingerprint. Nothing was published."
  exit 1
fi

if [ -n "${CM_ENV:-}" ]; then
  echo "CURRENT_FINGERPRINT=$CURRENT" >> "$CM_ENV"
fi

# An operator-supplied hash is a BETTER reference than EAS's record, not a way
# of switching the check off. `eas build --local` builds are never registered on
# EAS, so for a locally built binary the server has nothing to compare with --
# but the artifact itself does:
#
#     unzip -p app-release.apk assets/fingerprint
#
# Pass that value as OTA_EXPECTED_FINGERPRINT and the check still runs, just
# against the thing that is genuinely installed.
if [ -n "${OTA_EXPECTED_FINGERPRINT:-}" ]; then
  echo "operator-supplied fingerprint      : $OTA_EXPECTED_FINGERPRINT"
  if [ "$CURRENT" != "$OTA_EXPECTED_FINGERPRINT" ]; then
    echo
    echo "REFUSING: this commit fingerprints to $CURRENT, but the installed"
    echo "binary you named is $OTA_EXPECTED_FINGERPRINT. Installed apps would"
    echo "ignore this update entirely. Either publish the commit that matches"
    echo "that binary, or build a new one. Nothing was published."
    exit 1
  fi
  echo "ok      matches the operator-supplied installed-binary fingerprint"
  exit 0
fi

if [ -n "$LATEST" ] && [ "$CURRENT" = "$LATEST" ]; then
  echo "ok      matches the newest registered build on the '$BRANCH' channel"
  exit 0
fi

echo
if [ -z "$LATEST" ]; then
  echo "REFUSING: EAS has no registered build for the '$BRANCH' channel, so there"
  echo "is nothing to compare this commit against. Note that \`eas build --local\`"
  echo "builds are never registered on EAS, so a binary can be installed and in"
  echo "the store while EAS has no record of it."
else
  echo "REFUSING: this commit fingerprints to $CURRENT, but the newest registered"
  echo "build for the '$BRANCH' channel is $LATEST. Installed apps would ignore"
  echo "this update -- the publish would succeed and reach nobody."
fi
echo
echo "Resolve it one of two ways, both deliberate:"
echo "  * build a matching binary for this channel, then publish; or"
echo "  * read the hash out of the binary that IS installed --"
echo "      unzip -p <the.apk> assets/fingerprint"
echo "    and start this workflow again with OTA_EXPECTED_FINGERPRINT set to it."
echo
echo "Nothing was published."
exit 1
