# The Google Play service account

One credential, two automations: Codemagic can upload the AAB itself, and
`tools/ota/version-status.sh` can ask Play for its highest versionCode instead of reading a
number somebody has to remember to update.

A service account is a robot Google account — an email address and a key file instead of a
password and a phone. You grant it narrow permissions on this one app. If it ever leaks you
delete that account; your own Google login is untouched.

## Making one

**Play Console → Setup → API access**

1. If it asks to link a Google Cloud project, do that first. Any new project is fine.
2. Under **Service accounts**, click **Create new service account**. It hands off to Google
   Cloud Console.

**Google Cloud Console** (the tab that opens)

3. **Create service account** → name it `codemagic-publisher` → **Create and continue** →
   skip the optional roles → **Done**.
4. Open it → **Keys** → **Add key → Create new key → JSON**. A `.json` file downloads. That
   file IS the credential — treat it like a password, and never commit it.

**Back in Play Console → API access**

5. **Refresh service accounts** → the new one appears → **Grant access**.
6. Permissions: tick **Release to testing tracks**. Leave production off, so the robot can
   fill internal testing and promoting to production stays a human click. For the version
   query alone, view access to releases is enough.
7. Restrict it to the EJazz app, then **Invite user**.

## Giving it to the two places that use it

**Codemagic** — app settings → Environment variables:

| Variable | Value | Group | Secure |
|---|---|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | the whole contents of the .json file | `ejazz_eas` | yes |

`version-status.sh` picks it up on its own: with the variable set it asks Play, without it it
reads `play-version-code.txt`. Nothing else changes, and a broken credential stops the build
with "BROKEN CHECK" rather than pretending the versions are fine.

To upload automatically as well, add to `ejazz-android-release`:

```yaml
    publishing:
      google_play:
        credentials: $GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
        track: internal
```

**On the box**, for running the check by hand:

```bash
export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/etc/ejazz-play-sa.json   # mode 600, root only
bash tools/ota/version-status.sh
```

## Once it is in place

`tools/ota/play-version-code.txt` stops being load-bearing — the file remains as the fallback
for anyone running without the credential, but nobody has to update it after an upload.
