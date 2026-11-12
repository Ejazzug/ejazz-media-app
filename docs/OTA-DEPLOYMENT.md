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

### Preview workflow misconfiguration (pending fix)

`codemagic.yaml:134` sets `EAS_UPDATE_ENVIRONMENT: "production"` inside **`ejazz-ota-preview`**.
That is wrong: the preview build profile declares `environment: "preview"`, and build 21 was
made that way. It must be `"preview"`, so that preview updates carry the same configuration as
the preview binaries they land on. Both EAS environments happen to hold the same four variable
names today, so this is latent rather than actively broken — the day one value diverges,
Codemagic starts shipping production configuration to test phones. Pending; see §9.

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
  why its guard worked. Check (3) against the actual artifact when in doubt.

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
git event can start it. It refuses to publish on a dirty tree, on broken OTA config, or on a
fingerprint mismatch against the newest EAS-registered build. `OTA_ALLOW_RUNTIME_MISMATCH=true`
is the deliberate override for the local-build blind spot described in §4.

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

Codemagic equivalent: `ejazz-ota-production`, started by hand only. It additionally refuses to
run on a pull-request build and does not promote the preview branch: "the thing we tested" and
"the thing we ship" are the same commit or they are not the same thing at all.

**Staged rollout is the single biggest risk reducer available** and it needs no permissions
beyond Developer. Publish at 10%, watch `eas channel:insights` and `eas update:insights` for
crash rate and adoption, then widen with `eas channel:rollout production --action edit --percent
<n>`, or abandon with §8.

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

- `ejazz-ota-production` declares no `triggering:`, so no push, tag, PR or schedule can start it;
- it refuses pull-request builds, dirty working trees, broken OTA config and fingerprint mismatches;
- `OTA_PROMOTE_FROM_PREVIEW: "never"`;
- one human has Codemagic access;
- and, for now, §1 — there is no production binary an update could reach.

A proposed addition is a typed-confirmation variable so a mis-click cannot publish: a workflow
that aborts unless `OTA_CONFIRM_PRODUCTION` is set to an exact expected string at start time.
Pending; it is a `codemagic.yaml` change and is not yet applied.

## 10. Pending changes — identified, deliberately NOT applied

Documented here so they are not lost. None of these has been made.

| # | Change | File / system | Why |
|---|---|---|---|
| 1 | Add `EXPO_PUBLIC_PULSE_API_URL` to the EAS `production` **and** `preview` environments | expo.dev | §2 — otherwise the first production OTA silently kills Pulse |
| 2 | Reconcile the other `EXPO_PUBLIC_*` values between `codemagic.yaml` and the EAS environments; drop the stale `c32.radioboss.fm:8320` entry from the `ejazz_eas` group | expo.dev + Codemagic | §2 |
| 3 | `EAS_UPDATE_ENVIRONMENT: "production"` → `"preview"` in `ejazz-ota-preview` | `codemagic.yaml:134` | §2 |
| 4 | Add a non-empty assertion for every `EXPO_PUBLIC_*` before publishing | `codemagic.yaml` both OTA workflows | §2 — a missing public URL should break the workflow, not the app |
| 5 | Add the `OTA_CONFIRM_PRODUCTION` typed-confirmation gate | `codemagic.yaml` | §9 |
| 6 | Ship an OTA-capable production store build from `HEAD` or later | Codemagic + Play Store | §1 — production OTA has no reach until this exists |

## 11. Tooling and topology

| Channel | Branch | Protection (2026-11-12) | Who publishes |
|---|---|---|---|
| `preview` | `preview` | Unprotected | operator from this box, or `ejazz-ota-preview` |
| `production` | `production` | Unprotected — see §9 | operator only, manually, `ejazz-ota-production` |
| `development` | `development` | Unprotected | dev client only |

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
