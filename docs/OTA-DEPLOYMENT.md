# EJazz Media — OTA (EAS Update) deployment

Operating model: **single owner.** One person controls Codemagic, initiates every release,
tests it, approves it and ships it. There is no second approver by design. The controls below
are therefore structural (what *can* start a publish) rather than procedural (who signs off).

OTA was proven end to end on **2026-11-12**: a JS-only change was published to the `preview`
channel and appeared on an installed Android preview APK with no reinstall, and the follow-up
cleanup update removed it the same way.

Referenced by `codemagic.yaml` (`ejazz_eas` variable group comment).

---

## 0. Current state — read this before planning any release

| Fact | Value |
|---|---|
| Live Play Store binary | v0.1.0 (build 8), 2026-09-10, fingerprint `a567bfe5` |
| **Can the live app receive OTA?** | **No. See §1.** |
| Newest preview binary | v2.0.5 (build 21), 2026-11-12, fingerprint `18e635e1` — OTA works |
| Current source fingerprint | `18e635e1aaef1d554b355307de0f106f091d0201` |
| `preview` channel | Active, Unprotected, branch `preview`, 5 update groups published (see note) |
| `production` channel | Active, **Unprotected**, branch `production`, **0 updates ever** |
| Expo role — human operator | **Developer** |
| Expo role — `codemagic-ci` robot | **Developer** (keep it there; see §7) |

Two consequences follow from that table and they shape everything else: production OTA
currently reaches nobody, and nobody on this project holds a role that could publish to a
*protected* production channel.

> **Note on the 5 preview update groups.** The round-trip test published `OTA test 001`
> **twice** — once at 10:30 UTC (android `3deb62a8`, ios `ae33211b`) and again at 10:46
> (android `917d71f3`, ios `7fd0cf3e`) — because the publish command ran twice while only one
> result was observed. The cleanup update `e60e0b4c` (10:55, android) is the newest group and is
> what devices now run, so the duplicate is harmless history. Two lessons were folded into this
> runbook: always pass `--platform android` (the iOS groups are strays that match no binary),
> and **always confirm the channel state with `eas update:list` after publishing** rather than
> trusting the publish command's own output.

## 1. The live production binary cannot receive OTA updates at all

The Play Store app is **v0.1.0 (build 8), built 2026-09-10**. `expo-updates` was not added to
this project until **2026-11-10**, two months later. Before that date `updates` and
`runtimeVersion` were both `null` in the app config and the package was not installed at all.

So build 8 contains **no `expo-updates` native module**. It has no update URL, no channel, no
runtime version, and no code that checks for an update on launch. This is not a configuration
problem and no server-side change can reach it:

- Protecting, pausing or re-pointing the `production` channel has no effect on it.
- Publishing to `production` cannot reach it. The publish will succeed and report success.
- There is no rollback that touches it, because there is nothing to roll back from.

**The only way to make production OTA-capable is a new store release built from a commit that
includes `expo-updates`** — i.e. current `HEAD` or later. Until that build is live in the Play
Store and users have updated to it, treat production OTA as infrastructure under construction,
not as a release channel.

A useful side effect: until that release, a production publish is a harmless no-op. That is a
temporary accident of history, **not** a safety control. Build the controls in §6–§8 now, while
mistakes are still free.

## 2. Two separate environment systems — the trap that would break Pulse

This is the single most dangerous thing in the OTA path, because it is invisible to every
check the workflows currently run.

`EXPO_PUBLIC_*` values are **inlined into the JS bundle** at bundle time. They are not read at
runtime, so the values a user's app uses are whatever was baked into the bundle it is running.
The problem is that binaries and OTA bundles get those values from **two different sources**:

| | Where `EXPO_PUBLIC_*` comes from |
|---|---|
| **Production binary** (`ejazz-android-release`) | `eas build --local` on Codemagic, so from `codemagic.yaml` → `vars` and the `ejazz_eas` variable group |
| **Any OTA bundle** (`eas update --environment <env>`) | The **server-side EAS environment** of that name, stored on expo.dev |

These two sets are maintained separately and **they do not currently agree.**

`codemagic.yaml` sets `EXPO_PUBLIC_PULSE_API_URL: "https://control.ejazzug.com"` in the release
workflow's `vars`. The EAS **`production`** environment holds only four variables:
`EXPO_PUBLIC_EJAZZ_EXTRA_STREAM_URL`, `EXPO_PUBLIC_EJAZZ_NEWS_API_URL`,
`EXPO_PUBLIC_EJAZZ_RADIO_STREAM_URL`, `GOOGLE_SERVICES_JSON`.
**`EXPO_PUBLIC_PULSE_API_URL` is not among them.**

So a production OTA published today would ship a bundle in which that value is undefined.
`isPulseConfigured()` then returns false, no request is ever made, and **every Pulse feature
silently disappears** — no Pulse cards on Home, and the Control Room reaches nobody. The app
does not crash and nothing reports an error. This exact failure has happened before on a build;
the comment at `codemagic.yaml:12` records it.

**The fingerprint guard does not protect against this.** Environment variables are not
fingerprint inputs, so the hashes match perfectly while the configuration differs. A publish
that passes every existing check can still strip a URL the app depends on.

**Rule: before any production OTA, the EAS `production` environment must contain every
`EXPO_PUBLIC_*` the release workflow sets.** Reconciling it is a pending action — see §9.
The same applies to `preview`, which is also missing it.

### Why the preview test was unaffected

Build 21 was an EAS **cloud** build on the `preview` profile, so it took its values from the EAS
`preview` environment, which also lacks `EXPO_PUBLIC_PULSE_API_URL`. Verified by grepping the
APK: `stream.ejazzug.com` is present, `control.ejazzug.com` is absent. Pulse was already off in
that binary, so the two preview updates — published with `--environment preview` — matched it
exactly and regressed nothing.

### The bundler cache can serve stale `EXPO_PUBLIC_*` values

**"The environment is correct" and "the bundle is correct" are two different
claims, and this is how they come apart.** It is the least obvious failure in
this whole document.

`process.env.EXPO_PUBLIC_*` is inlined by babel at **transform** time, and
Metro's transform cache is **not keyed on the values of those variables**. A
bundle can therefore be built from a warm cache carrying configuration that is
no longer true, while every guard passes: `check-env-vars.sh` proves the EAS
environment holds the right values, the fingerprint proves the native side
matches, and **neither says anything about what was actually compiled in**.

Measured on 2026-11-12, minutes after `EXPO_PUBLIC_PULSE_API_URL` was added to
both EAS environments:

| Export | Bundle | `control.ejazzug.com` |
|---|---|---|
| `eas env:exec preview` + `expo export`, warm cache | `entry-e9e00106….hbc`, 5,002,599 B | **absent** |
| the same with `--clear` | `entry-4e7e86da….hbc`, 5,004,143 B | **present** |

The cache at `/tmp/metro-cache` was serving a bundle built before the variable
existed. The variable name was never wrong — `lib/pulse.ts`, `lib/shows.ts`,
`lib/appConfig.tsx`, `lib/hosts.ts` and `lib/notificationFeed.ts` all read
`process.env.EXPO_PUBLIC_PULSE_API_URL` exactly. Publishing that first bundle
would have shipped Pulse silently disabled: the precise failure the environment
check was written to prevent, one layer further down.

**What is done about it:**

- `verify-publication.sh` publishes with **`eas update --clear-cache`**. One full
  rebuild per publish is the right price for knowing what shipped.
- `check-publish-readiness.sh` exports with **`--clear`**, and asserts the
  expected URLs are present **in the compiled bytecode** rather than merely in
  the environment.

**Where it bites:** Codemagic clones fresh and caches only `~/.pnpm-store`, so
its bundler cache is cold and the flags change nothing there. The exposure is
publishing from a machine with a warm cache — this box, for instance — and it
would return to CI **the moment anyone adds a Metro cache path to `cache_paths`**
as a build-speed optimisation. If that ever looks tempting, read this section
first.

### Preview workflow misconfiguration — fixed 2026-11-12

`ejazz-ota-preview` used to set `EAS_UPDATE_ENVIRONMENT: "production"` while publishing to the
preview branch. The preview build profile declares `environment: "preview"` and build 21 was
made that way, so preview updates were being bundled with production configuration. Both EAS
environments held the same four variable names at the time, which is the only reason nothing
broke — the day one value diverged, Codemagic would have started shipping production
configuration to test phones.

It is now `"preview"`, and `tools/ota/check-env-vars.sh` asserts the branch/environment pairing
on every run of both workflows, so the two cannot drift apart silently again. See §12.

## 3. What ships OTA and what needs a new build

| Ships over the air | Needs a new binary |
|---|---|
| JS/TS in `app/`, `components/`, `lib/`, `context/`, `hooks/` | A new native module (anything with an `android/` dir) |
| Bundled images and fonts under `assets/` | An Expo SDK bump or React Native version change |
| Text, styles, layout, screen logic | Native keys in `app.config.base.json` — permissions, icon, package name, plugins |
| `EXPO_PUBLIC_*` **values**, subject to §2 | `plugins/*.js`, `plugins/native/*.kt` |
| | `google-services.json` |
| | Adding update code signing |

**The test is not a judgement call — it is whether the native fingerprint changes.** §4.

## 4. Runtime version compatibility

`runtimeVersion.policy = "fingerprint"`. The runtime version is a hash of the **native** side,
so an update is only offered to a binary whose native modules match. That is the safety
property: a JS update needing a module an older install lacks reaches nobody instead of
crashing it.

The corollary is that **a fingerprint mismatch is a silent no-op** — the publish succeeds,
reports success, and no phone ever sees it. Check before every publish:

```bash
cd /opt/ejazz-media/artifacts/ejazz-media-app

# 1. What the working tree would publish as
npx --no-install expo-updates fingerprint:generate --platform android \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["hash"])'

# 2. What the newest EAS-registered build expects
set -a; . /etc/ejazz-eas.env; set +a
eas build:list --platform android --limit 1 --json --non-interactive \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["runtime"]["version"])'

# 3. Most authoritative: what a specific APK actually carries
unzip -p /path/to/build.apk assets/fingerprint
```

Facts worth knowing:

- **The fingerprint does not vary by build profile.** `eas.json` is hashed as a whole file, so a
  `preview` APK and a `production` AAB from the same commit carry the **same** runtime version.
  A preview test therefore genuinely validates native compatibility for the production
  binary — which is what makes the flow in §5 sound.
- **It does not validate configuration.** Same fingerprint, different `EXPO_PUBLIC_*`. See §2.
- **Fingerprints are per platform.** Android and iOS hashes differ, so a publish without
  `--platform android` creates a second iOS group matching no binary that exists.
- `fingerprint:generate` prints its source list, which is the fastest way to see *why* a
  fingerprint moved: `app.config.base.json`, `eas.json`, `.easignore`, `.gitignore`,
  `google-services.json`, the app icon, `plugins/*.js`, `packageJson:scripts`, and the
  autolinking config. Nothing under `app/` or `components/` is in it.
- `eas build --local` builds are **not registered on EAS**, so the newest build EAS knows about
  can be older than what is installed. Build 21 was a cloud build and *is* registered, which is
  why its guard passed. For a locally built binary, read check (3) off the artifact and pass it
  as `OTA_EXPECTED_FINGERPRINT` — §12.

## 5. The release flow

```
Development  →  Preview OTA  →  Test on my phone  →  Owner approval  →  Production OTA  →  Monitoring
   (local)      manual start      real device        explicit, me        manual start      insights
```

Single-owner model: every arrow is crossed by the same person deliberately. No arrow is
automatic. Nothing in Codemagic starts on a push, a tag, a pull request or a schedule.

Gate conditions for crossing into production:

1. The **same commit** is live on `preview` and was seen working on a real device. Not a rebuild
   of "the same change" — the same commit. `ejazz-ota-production` enforces this by refusing to
   promote the preview branch.
2. The working tree is clean, so the update's contents match a commit.
3. `pnpm run typecheck` (repo root, all four projects) and `pnpm run lint` (in the app) pass.
4. The fingerprint matches the **production** binary — §4.
5. The EAS `production` environment contains every `EXPO_PUBLIC_*` the release workflow sets — §2.
6. The last-good production update group ID is written down, before publishing.

## 6. Preview — publish (manual only)

Preview is the testing channel; `distribution: internal`, so the audience is installed test APKs.

### From this box

```bash
cd /opt/ejazz-media/artifacts/ejazz-media-app
set -a; . /etc/ejazz-eas.env; set +a
eas update --branch preview --platform android \
  --environment preview --message "<what changed>" --non-interactive
```

- `--environment preview` is **required** from Expo SDK 55 on; `eas update` refuses to run without it.
- Nothing sources `/etc/ejazz-eas.env` automatically. Every command loads it itself.
- `--platform android` keeps a pointless iOS update group out of the branch.

### From Codemagic

Workflow `ejazz-ota-preview`, started by hand from the UI. It declares no `triggering:`, so no
git event can start it. Nine steps, in this order — the first that fails publishes nothing:

1. **Authenticate** — refuses immediately if `EAS_ACCESS_TOKEN` is absent, and maps it to
   `EXPO_TOKEN`, the name eas-cli reads. `set -x` is deliberately absent so the token never
   reaches a log.
2. **Refuse a pull-request build** — belt and braces behind the absent `triggering:`.
3–5. **pnpm 10.26.1, `pnpm install --frozen-lockfile`, `eas-cli@27.7.2`** (pinned).
6. **Working tree and OTA config** — clean tree, `updates.url`, `updates.enabled`,
   `runtimeVersion.policy == "fingerprint"`, `extra.eas.projectId`, a build profile that uses
   the target channel, and `expo-updates` on the 57 line.
7. **`tools/ota/check-env-vars.sh`** — branch/environment pairing plus every required
   `EXPO_PUBLIC_*`. §12.
8. **`tools/ota/check-fingerprint.sh`** — §12.
9. **`tools/ota/verify-publication.sh`** — publishes, then proves it landed. §12.

`OTA_EXPECTED_FINGERPRINT` is the escape hatch for a locally built binary; it replaced
`OTA_ALLOW_RUNTIME_MISMATCH`, which switched the check off rather than redirecting it.

### Validating without publishing

Workflow **`ejazz-ota-validate`** — "OTA Validate (preview, NO PUBLISH)". It runs
every check the preview publish runs and then stops.

It is a **separate workflow rather than a `DRY_RUN` flag on
`ejazz-ota-preview`**, deliberately. A flag would mean the thing you run to
validate is the thing that publishes, with one variable standing between the
two: one typo, one value left over from a previous run, one default flipped, and
it publishes. There is no `eas update` anywhere in this workflow and no variable
that could turn one on. Absence of capability over configuration — the same
reasoning as the absent `triggering:` blocks.

Hard-wired to preview, and it **asserts** that rather than defaulting to it,
because Codemagic lets any variable be overridden at start time.

Nine steps: the preview chain up to and including the fingerprint check, then
`check-publish-readiness.sh` in place of the publish — token identity, channel
state, the current head of the branch with the group ID to note for rollback,
and the one thing no earlier step covers: **that the bundle actually compiles**,
with its configuration verified in the compiled bytecode. A bundle that fails to
build is the likeliest way a publish dies after every guard has reported success.

### What to expect on the device

`CHECK_ON_LAUNCH=ALWAYS` with `LAUNCH_WAIT_MS=0` means the app never waits: it launches the
cached bundle and fetches in the background. **The change appears on the second launch after
publishing.** Fully close the app between the two; backgrounding may not count. This is not a
failure — do not re-publish chasing it.

## 7. Production — publish (manual, owner-approved, never automatic)

**Not yet usable.** §1 — no OTA-capable production binary exists. These are the mechanics for
after that store release ships.

```bash
cd /opt/ejazz-media/artifacts/ejazz-media-app
set -a; . /etc/ejazz-eas.env; set +a

# Staged: 10% first, widen only after monitoring
eas update --branch production --platform android --environment production \
  --rollout-percentage 10 --message "<what changed>" --non-interactive
```

### From Codemagic — and the approval gate

Workflow `ejazz-ota-production`, started by hand only. Ten steps: the same chain as preview,
plus **`tools/ota/confirm-production.sh` as the second step**, before pnpm and eas-cli, so an
unauthorised run fails in seconds having touched nothing. It also ends with
`eas channel:view production`.

To publish, set **both** of these when starting the workflow:

| Variable | Value |
|---|---|
| `OTA_CONFIRM_PRODUCTION` | the short SHA of the commit being published (`git rev-parse --short HEAD`) |
| `EAS_UPDATE_MESSAGE` | what is changing and why — required, no default |

`OTA_CONFIRM_PRODUCTION` is committed **empty**. A value stored in version control would
authorise every future run, which is the opposite of a confirmation. Expect
`OTA_EXPECTED_FINGERPRINT` to be needed too: production binaries are built with
`eas build --local` and are therefore never registered on EAS, so read it off the artifact that
went to the Play Store.

The workflow does not promote the preview branch (`OTA_PROMOTE_FROM_PREVIEW: "never"`): "the
thing we tested" and "the thing we ship" are the same commit or they are not the same thing at
all.

**Staged rollout is the single biggest risk reducer available.** Publish at 10%, watch
`eas channel:insights` and `eas update:insights` for crash rate and adoption, then widen with
`eas channel:rollout production --action edit --percent <n>`, or abandon with §8. Developer is
enough **while the channel is unprotected**; once it is protected, starting and ending a rollout
needs Release Manager like everything else in §9.

### Keep the robot at Developer

`codemagic-ci` is a **Developer** and must stay one. Do not promote it to Release Manager,
Admin or Owner to get past a protection refusal — that refusal is the control working. A
Release-Manager robot token in Codemagic would punch straight through channel protection,
because Expo's "CI jobs are capped at Developer permissions" rule applies to **EAS Workflows**,
not to Codemagic, which authenticates with a plain robot token.

## 8. Rollback and recovery

Nothing recalls a bundle already running on a phone. Every rollback is a **new instruction**
clients pick up on their next launch check and show on the launch after that. **Budget two app
launches, not seconds.** Keep the last-good group ID to hand *before* you need it.

```bash
set -a; . /etc/ejazz-eas.env; set +a

# What is live, and the group IDs you will need
eas update:list --branch production --limit 5 --non-interactive

# A. EMERGENCY STOP — widest and fastest. Clients stop being offered anything
#    and keep running what they already have. Buys time to diagnose.
eas channel:pause production

#    ...and when the fix is ready
eas channel:resume production

# B. NORMAL ROLLBACK — re-publish a known-good earlier update as the newest one.
eas update:republish --group <LAST_GOOD_GROUP_ID> --message "Roll back to <x>" --non-interactive

# C. NUCLEAR — send clients back to the JS embedded in their installed binary.
#    Use when every published update is suspect.
eas update:roll-back-to-embedded --branch production --platform android \
  --environment production --non-interactive

# D. MID-ROLLOUT — abandon a staged rollout before it widens.
eas update:revert-update-rollout --non-interactive
```

Which to reach for:

- **Something is wrong but you don't know what** → A, then diagnose. Pausing is reversible and
  costs users nothing; they keep the bundle they have.
- **You know which update was good** → B. Prefer it over re-publishing a hand-reverted working
  tree: republishing ships bytes already proven on a device, a rebuild ships bytes that are not.
- **The OTA path itself is suspect** → C. Note that "embedded" means the JS inside the installed
  binary, so this cannot go back past the binary. If the fault is in the binary, OTA cannot fix
  it and a store release is the only route.
- **Caught during a 10% rollout** → D, which is why §7 publishes at 10%.

A rollback obeys the same fingerprint rule as any publish: it only reaches binaries whose
runtime version matches. Rolling back for one fingerprint does not touch installs on another.

**All four of these become Release-Manager-only if the channel is protected.** See §9.

## 9. Roles, channel protection, and what only an Admin/Owner can do

### The permission reality

Both the human operator and the `codemagic-ci` robot hold **Developer** on account
`ejazz-media`. Developer can publish updates, pause and resume channels, republish, roll back
and run rollouts — on channels that are **not protected**. That is the whole current release
capability and it is sufficient for everything in §6–§8.

### The protection trade-off — read before requesting it

`eas channel:protect production` restricts **all** of the following to Release Managers, Admins
and Owners:

- publishing to a branch the channel points to — including `eas update`, **republishing and rollbacks**
- renaming or deleting that branch
- editing the channel, including re-pointing it, **starting or ending a rollout, and pausing or resuming updates**
- deleting the channel
- removing the protection

So protecting `production` while the operator remains a Developer would remove not only
publishing but **every emergency control in §8** — pause, republish, roll back, revert rollout.
A single-owner operation would be locked out of its own production channel, including during an
incident. **Protection alone is not a safety improvement here; it is an outage waiting for a bad
day.**

Protection is only worth requesting **together with a Release Manager grant for the human
operator**. That combination gives exactly the intended shape:

- the human can publish and roll back production, manually, from their own account;
- the `codemagic-ci` robot, still a Developer, **cannot** — so no Codemagic workflow, however it
  is started or misconfigured, can reach real users;
- `preview` stays unprotected and keeps working from this box exactly as it does today.

### Exact steps for an Expo Admin or Owner — one time

Someone holding Admin or Owner on the `ejazz-media` account must do both of these, in this
order. Neither can be done from this box, and neither should be worked around.

1. **Grant the human operator the Release Manager role.**
   expo.dev → the `ejazz-media` account → **Account settings → Members** → find the human
   operator's user account → change role from **Developer** to **Release Manager** → save.
   *Do this first.* Protecting the channel before the grant locks the operator out in the gap.
2. **Protect the production channel.** Either:
   - expo.dev → project `ejazz-media-app` → **Updates → Channels → `production`** → **Protect channel**; or
   - from a machine signed in as that Admin/Owner: `eas channel:protect production`
     (requires EAS CLI ≥ 24.0.0; this box runs 27.7.2).
3. **Leave the `codemagic-ci` robot at Developer.** Do not change it. Its inability to publish
   production is the point.
4. **Confirm back to the operator**, who then verifies from this box that
   `eas channel:view production` reports `Protection  Protected`, and that `preview` still
   reports `Unprotected`.

Notes: no pricing-tier requirement is documented for protected channels. Audit logs — a record
of who published what — are **Enterprise plan only**. Transferring the project to another
account **removes protection from all channels**.

### Until an Admin/Owner acts

Production is unprotected, so the Developer token *can* publish to it. The controls that exist
are the ones the operator fully owns, and they are structural rather than permission-based:

- `ejazz-ota-production` declares no `triggering:`, so no push, tag, PR or schedule can start it
  — verified by `grep -n "^\s*triggering:" codemagic.yaml` returning nothing for the whole file;
- **`OTA_CONFIRM_PRODUCTION` must equal the short SHA of the commit being published.** This is
  the control that makes "never automatic" structural rather than a convention: an automatic run
  has no way to produce that value, so it fails at the second step. A stale value from the last
  release fails too, because the SHA moved;
- it refuses pull-request builds, dirty working trees, broken OTA config, a missing required
  `EXPO_PUBLIC_*`, and a fingerprint that matches no binary on the target channel;
- `OTA_PROMOTE_FROM_PREVIEW: "never"`;
- one human has Codemagic access;
- and, for now, §1 — there is no production binary an update could reach. **This last one is an
  accident of history, not a control**, and it expires the day the store build in §10 ships.

## 10. Status of the Phase 1 work

### Done — 2026-11-12, commit `7e5ddbb`

| # | Change | Where |
|---|---|---|
| 1 | `EXPO_PUBLIC_PULSE_API_URL` added to the EAS `production` **and** `preview` environments | expo.dev, by the operator |
| 2 | `EAS_UPDATE_ENVIRONMENT` corrected to `"preview"` in `ejazz-ota-preview`, plus an assertion that branch and environment always agree | `codemagic.yaml`, `check-env-vars.sh` |
| 3 | Non-empty assertion for every required `EXPO_PUBLIC_*` before publishing | `check-env-vars.sh` |
| 4 | `OTA_CONFIRM_PRODUCTION` approval gate, keyed to the commit SHA | `confirm-production.sh` |
| 5 | Fingerprint check scoped to the target channel; `OTA_ALLOW_RUNTIME_MISMATCH` replaced by `OTA_EXPECTED_FINGERPRINT` | `check-fingerprint.sh` |
| 6 | Publish verification — group ID, runtime, platform, commit, and head-of-branch confirmation | `verify-publication.sh` |
| 7 | Pull-request guard added to the preview workflow, matching production | `codemagic.yaml` |

### Done — 2026-11-12, follow-up commit

| # | Change | Where |
|---|---|---|
| 8 | `ejazz-ota-validate` — runs every check and publishes nothing; hard-wired to preview | `codemagic.yaml`, `check-publish-readiness.sh` |
| 9 | `eas update --clear-cache` on every publish, and `expo export --clear` in the readiness check — §2 | `verify-publication.sh`, `check-publish-readiness.sh` |
| 10 | Assert the required `EXPO_PUBLIC_*` reach the **compiled bytecode**, not just the environment | `check-publish-readiness.sh` |

### Remaining

| # | Change | File / system | Why |
|---|---|---|---|
| A | **Ship an OTA-capable production store build** from `HEAD` or later | Codemagic + Play Store | §1 — production OTA has no reach until this exists. The single highest-value item here |
| B | Reconcile the remaining `EXPO_PUBLIC_*` values between `codemagic.yaml` and the EAS environments; drop the stale `c32.radioboss.fm:8320` entry from the `ejazz_eas` group | expo.dev + Codemagic | §2 — names now agree, values are still maintained in two places |
| C | Declare `"environment": "production"` on the `production` and `production-apk` build profiles | `eas.json` | §2 — **must ride in the same commit as item A**, because `eas.json` is a fingerprint input and changing it alone de-synchronises OTA from every installed binary |
| D | Push `shareables-designer`, then bring `codemagic-release` forward | git | None of the guards exist in CI until Codemagic clones them |
| E | Release Manager grant, then channel protection | Expo Admin/Owner | §9 — in that order |

## 11. Tooling and topology

| Channel | Branch | Protection (2026-11-12) | Who publishes |
|---|---|---|---|
| `preview` | `preview` | Unprotected | operator from this box, or `ejazz-ota-preview` |
| `production` | `production` | Unprotected — see §9 | operator only, manually, `ejazz-ota-production` |
| `development` | `development` | Unprotected | dev client only |

Five Codemagic workflows, none declaring `triggering:`: `ejazz-android-release` and
`ejazz-android-preview` build binaries; `ejazz-ota-preview` and `ejazz-ota-production` publish
updates; `ejazz-ota-validate` checks without publishing (§6).

Each `eas.json` build profile carries a `channel`, and that is what ties a binary to a channel:
`preview` and `preview-aab` → `preview`; `production` and `production-apk` → `production`.
**An update published to a channel no installed build uses is a no-op that reports success.**
Channels and branches were created 2026-11-11; before that the config named channels with no
server-side existence, so a publish had nowhere to land.

- `eas-cli` is installed globally at `/usr/bin/eas` (27.7.2), deliberately **outside** the app so
  the repo and the build fingerprint are untouched. It is a tool, not a dependency. Codemagic
  pins the same version, because this is the tool that decides what runs on phones already in
  people's hands.
- The token lives at `/etc/ejazz-eas.env` (mode 600, root only) as `EXPO_TOKEN=`. In Codemagic it
  arrives as `EAS_ACCESS_TOKEN` from the `ejazz_eas` group and is mapped to `EXPO_TOKEN`, the
  name eas-cli actually reads. `set -x` is deliberately absent from those workflows so the token
  never reaches a log.
- EAS project id `1da275ed-5456-4fbd-945b-4616f957c2fd`, account `ejazz-media`.
- Codemagic clones from `github.com/Ejazzug/ejazz-media-app`. Work sits on `shareables-designer`;
  the build branch is `codemagic-release`. `main` is a separate protected root and is left alone.
  Check `git ls-remote --heads origin` against local HEAD before a build.

## 12. The guard scripts in `tools/ota/`

Five files, shared by both OTA workflows. They live at the **repo root, outside
`artifacts/ejazz-media-app/`**, and that location is load-bearing rather than tidy: `eas.json`
and the app's `package.json` `scripts` object are both **native fingerprint inputs**, so release
tooling placed in either would change the runtime version of every bundle built afterwards and
silently de-synchronise OTA from every installed app. `codemagic.yaml` and `tools/ota/` are
outside the fingerprint entirely — confirmed by regenerating it after this work landed:
still `18e635e1aaef1d554b355307de0f106f091d0201`.

Each is invoked as `bash tools/ota/<script>` from the repo root, so the executable bit is not
load-bearing either.

### `required-public-vars.txt`

The manifest of every `EXPO_PUBLIC_*` the app needs baked into its bundle. Comments and blank
lines are ignored. Adding a name here makes it mandatory for every future publish — do that in
the same commit as the code that reads it.

### `check-env-vars.sh <branch> <environment>`

Two assertions. First, that branch and environment agree (`preview:preview`,
`production:production`, `development:development`); anything else is refused, because an update
whose configuration comes from a different environment than the installed binaries' would
silently reconfigure the app. Second, that every name in the manifest resolves to a non-empty
value, checked with `eas env:exec` so it tests what the bundler will actually see rather than a
listing of what someone believes is configured. **Values are never printed — only the name and
the length.** This is the only guard that catches a configuration gap, because environment
variables are not fingerprint inputs.

### `check-fingerprint.sh <branch> <environment>`

Computes this commit's Android fingerprint and compares it against the newest **FINISHED** build
that lands on the target channel. The channel-to-profile mapping is read from `eas.json`, where
it is actually defined, because `eas build:list --channel` returns nothing for this project —
EAS has no channel recorded against these builds — and `--build-profile "$BRANCH"` would miss a
binary built with `preview-aab` or `production-apk`.

`OTA_EXPECTED_FINGERPRINT` is a **better reference, not an off switch**: pass the hash read from
the binary that is genuinely installed —

```bash
unzip -p app-release.apk assets/fingerprint
```

— and the check still runs, against the thing that matters. This is how the `eas build --local`
blind spot is handled now. Exports `CURRENT_FINGERPRINT` for the publish step to assert on.

### `check-publish-readiness.sh <branch> <environment> [message]`

Everything a publish would otherwise be the first thing to exercise, without
publishing. Run by `ejazz-ota-validate` after the environment and fingerprint
checks. Five parts, all read-only:

1. **`eas whoami`** — token identity and role, so a permission problem surfaces
   here by name rather than as a refusal at the publish.
2. **`eas channel:view`** — the channel exists and is Active. An update published
   to a channel that does not exist is a no-op that reports success.
3. **`eas update:list`** — the current head, which is where the operator reads the
   last-good group ID that §8 says to write down *before* publishing.
4. **`expo export --clear` under `eas env:exec`** — the bundle compiles, and the
   configuration is checked **in the compiled bytecode** via
   `OTA_ASSERT_BUNDLE_CONTAINS`. `--clear` is not optional; see §2.
5. **A summary of what a publish would send** — branch, environment, platform,
   commit, message and runtime — so it can be compared against what was intended.

Writes nothing. The export goes to a temporary directory and is deleted on exit.

### `confirm-production.sh`

The approval gate. Refuses a pull-request build, refuses unless
`OTA_PROMOTE_FROM_PREVIEW=never`, and requires `OTA_CONFIRM_PRODUCTION` to equal the short SHA
of `HEAD`. A SHA rather than a fixed word because an automatic run cannot produce one, a stale
one fails, and typing it forces the operator to look at which commit is shipping. Runs second in
the workflow, before any setup work.

### `verify-publication.sh <branch> <environment> <message>`

Publishes with `--platform android` and **`--clear-cache`** (§2 — without it a warm bundler
cache can ship stale `EXPO_PUBLIC_*` values past every other guard), then parses the result and
asserts an Android group exists
carrying the expected runtime, reports group ID / update ID / runtime / platform / branch /
commit / message, and confirms from the server that the group it named is at the head of the
branch. It exists because the previous version printed `eas update:list` and left the reading to
a human — which is how the same test update came to be published twice on 2026-11-12, sixteen
minutes apart, with both runs reporting success.

`--parse-only <file.json>` runs the assertions against a saved publish result and **publishes
nothing**, which is how they were tested without sending anything to a phone.

### A note on eas-cli output

Every parser here skips to the first `{` or `[` before calling `JSON.parse`. eas-cli prints an
`Environment variables ... loaded` banner on **stdout** even with `--json`, so parsing the whole
stream throws and the value comes back empty. Verified 2026-11-12. Reuse the helpers rather than
re-learning this.
