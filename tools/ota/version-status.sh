#!/usr/bin/env bash
# Where the Android versionCode stands, and whether the next build can be uploaded.
#
# Run it before starting ANY release build. It answers the two questions that matter and
# cannot be answered from one place:
#
#   * what will the next build be numbered?   -- EAS holds the counter and bumps it per build
#   * is that number free on Play?            -- Play is invisible from here, so we track the
#                                                high-water mark in play-version-code.txt
#
# Exits non-zero when the next build would reuse a code Play already has. That is a refusal to
# build, not a warning: the alternative is finding out at upload, after a 20-minute build.
#
#   bash tools/ota/version-status.sh              report, and fail on drift
#   bash tools/ota/version-status.sh --record 25  record 25 as uploaded to Play
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT/artifacts/ejazz-media-app"
PLAY_FILE="$ROOT/tools/ota/play-version-code.txt"

read_play() {
  # The `|| true` is the same lesson a third time: an empty or missing file makes grep exit
  # 1, and under `set -euo pipefail` that kills the caller mid-assignment, with status 1 and
  # no output -- which reads exactly like a refusal. A broken check must never be mistakable
  # for a verdict. Empty comes back as "", and the caller validates it.
  { grep -vE '^\s*(#|$)' "$PLAY_FILE" 2>/dev/null || true; } | head -1 | tr -d '[:space:]'
}

if [ "${1:-}" = "--record" ]; then
  want="${2:-}"
  if ! [[ "$want" =~ ^[0-9]+$ ]]; then
    echo "--record needs a number, e.g. --record 25" >&2
    exit 2
  fi
  have="$(read_play)"
  if [ "$want" -lt "$have" ]; then
    echo "Refusing: $want is lower than the $have already recorded. A high-water mark only" >&2
    echo "goes up; if Play really is lower, edit the file by hand and say why." >&2
    exit 2
  fi
  # Rewrite only the value line, so the explanation above it survives.
  tmp="$(mktemp)"
  { grep -E '^\s*(#|$)' "$PLAY_FILE"; echo "$want"; } > "$tmp"
  mv "$tmp" "$PLAY_FILE"
  echo "Recorded $want as the highest versionCode on Play."
  exit 0
fi

if [ -z "${EXPO_TOKEN:-${EAS_ACCESS_TOKEN:-}}" ]; then
  echo "No EXPO_TOKEN (or EAS_ACCESS_TOKEN). On the box: set -a; . /etc/ejazz-eas.env; set +a" >&2
  exit 2
fi
export EXPO_TOKEN="${EXPO_TOKEN:-$EAS_ACCESS_TOKEN}"

cd "$APP_DIR"
# BOTH `|| true`s are load-bearing under `set -euo pipefail`. Without the second one, a grep
# that matches nothing exits 1, the assignment fails, and the script dies RIGHT HERE with
# status 1 and not one line of output -- which is exactly how this guard failed Codemagic
# builds #20 and #21 and told nobody why. Stderr is kept, not sent to /dev/null, because when
# eas-cli cannot read the project its complaint is the whole diagnosis.
# `eas` when the workflow has installed it globally (it has, by this point in the build),
# `npx --yes` otherwise, which covers running this by hand on the box. --yes matters: npx
# without it stops to ask permission to download, and CI has nobody to answer.
if command -v eas >/dev/null 2>&1; then EAS_BIN=(eas); else EAS_BIN=(npx --yes eas); fi
raw="$("${EAS_BIN[@]}" build:version:get --platform android --non-interactive 2>&1 || true)"
current="$(printf '%s' "$raw" | grep -oE 'versionCode - [0-9]+' | grep -oE '[0-9]+' | tail -1 || true)"
if [ -z "$current" ]; then
  echo "Could not read the remote versionCode from EAS." >&2
  echo "This is a BROKEN CHECK, not a version collision -- nothing about Play is known here." >&2
  echo "Usual causes: the step ran before 'pnpm install', so eas-cli cannot read the project;" >&2
  echo "or EAS_ACCESS_TOKEN is missing from the ejazz_eas group. What eas-cli said:" >&2
  echo "---" >&2
  printf '%s\n' "$raw" >&2
  echo "---" >&2
  exit 2
fi

if ! [[ "$current" =~ ^[0-9]+$ ]]; then
  echo "EAS returned a versionCode that is not a number: '${current}'" >&2
  exit 2
fi

play="$(read_play)"
# Validated, not trusted. An empty or malformed file would otherwise reach the arithmetic
# below, where bash fails under `set -e` and the script dies with status 1 and no output --
# indistinguishable from a real refusal, which is the failure this whole guard exists to
# avoid inflicting on someone.
if ! [[ "$play" =~ ^[0-9]+$ ]]; then
  echo "tools/ota/play-version-code.txt does not hold a number (read: '${play}')." >&2
  echo "This is a BROKEN CHECK, not a version collision. Put the highest versionCode" >&2
  echo "uploaded to Play on its own line, below the comments." >&2
  exit 2
fi
# Every profile that uploads to Play carries autoIncrement, so the next build is current + 1.
# `production-apk` deliberately does not: it must reuse the AAB's code so the APK people test
# IS the binary being shipped.
next=$((current + 1))

echo "EAS counter (what a build bumps from) : $current"
echo "Next production build will be         : $next"
echo "Highest code recorded on Play         : $play"

if [ "$next" -le "$play" ]; then
  cat >&2 <<MSG

REFUSING: the next build would be $next, and Play already has $play.
The EAS counter has fallen behind Play. Raise it, then build:

    cd artifacts/ejazz-media-app
    printf '%s\n' "$play" | script -qec "npx --yes eas build:version:set --platform android --profile production" /dev/null
    npx --yes eas build:version:get --platform android --non-interactive   # read it BACK

(build:version:set has no non-interactive flag, and its pty echo prints escape noise that
reads like a different number, which is why the read-back is part of the procedure. No
backticks in this message: the heredoc is unquoted, because it interpolates the numbers, so
anything in backticks would RUN -- and once did.)
MSG
  exit 1
fi

echo
echo "OK -- $next is free on Play."
