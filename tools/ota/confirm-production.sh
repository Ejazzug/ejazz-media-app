#!/usr/bin/env bash
# The production approval gate: a publish to real users happens only because a
# person decided it should, for a specific commit, at that moment.
#
#   usage: tools/ota/confirm-production.sh
#   env:   OTA_CONFIRM_PRODUCTION   must equal the short SHA of HEAD
#          OTA_PROMOTE_FROM_PREVIEW must be "never"
#          CM_PULL_REQUEST          must be absent or "false"
#
# WHY A COMMIT SHA RATHER THAN A FIXED WORD. A fixed token like "SHIP" gets
# memorised and typed reflexively, and a value saved in the workflow's variables
# is no gate at all. The short SHA of HEAD has three properties no constant has:
#
#   * An AUTOMATIC run cannot satisfy it. Nothing derives it, so a scheduled
#     build, a webhook, or a `triggering:` block added here by accident starts,
#     fails at this step, and publishes nothing. This is what makes "production
#     never publishes automatically" structural rather than a comment.
#   * A STALE value fails. Last release's SHA is not this release's SHA, so a
#     copy-pasted variable cannot carry authorisation forward.
#   * It forces the operator to look at WHICH COMMIT is shipping, which is the
#     decision that actually matters and the one a yes/no prompt hides.
#
# This project has a single release operator by design. This gate is therefore
# not an approval queue -- it is that one person being made to state, in a form
# only they can produce, what they are sending to people's phones.
set -euo pipefail

echo "--- production publish authorisation"

# 1. Never from a pull request. The absent `triggering:` block in codemagic.yaml
#    already prevents this; this stops the FIRST automatic run rather than the
#    second if one is ever added.
if [ -n "${CM_PULL_REQUEST:-}" ] && [ "${CM_PULL_REQUEST}" != "false" ]; then
  echo "REFUSING: this is a pull-request build. Production OTA is manual only."
  exit 1
fi

# 2. This workflow publishes the commit it is standing on. It does not copy,
#    promote or re-point whatever happens to be on the preview branch: "the
#    thing we tested" and "the thing we ship" are the same commit, or they are
#    not the same thing at all.
if [ "${OTA_PROMOTE_FROM_PREVIEW:-}" != "never" ]; then
  echo "REFUSING: OTA_PROMOTE_FROM_PREVIEW must be 'never'."
  echo "Publish the commit you tested, from this workflow, instead."
  exit 1
fi

# 3. The approval itself.
EXPECT="$(git rev-parse --short HEAD)"
GOT="${OTA_CONFIRM_PRODUCTION:-}"

if [ -z "$GOT" ]; then
  echo "REFUSING: production publish is not confirmed."
  echo
  echo "This commit is $EXPECT:"
  echo "    $(git log -1 --pretty='%s')"
  echo
  echo "If that is what should reach every user, start this workflow again with"
  echo "    OTA_CONFIRM_PRODUCTION=$EXPECT"
  echo "Nothing was published."
  exit 1
fi

if [ "$GOT" != "$EXPECT" ]; then
  echo "REFUSING: the confirmation does not match this commit."
  echo "  confirmed : $GOT"
  echo "  HEAD      : $EXPECT  ($(git log -1 --pretty='%s'))"
  echo
  echo "This is usually a confirmation left over from an earlier release. Check"
  echo "which commit you mean to publish. Nothing was published."
  exit 1
fi

echo "ok      confirmed for commit $EXPECT by the release operator"
echo "        $(git log -1 --pretty='%s')"
