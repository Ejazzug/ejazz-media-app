#!/usr/bin/env python3
"""The highest Android versionCode Google Play actually holds, printed as one number.

This exists to delete a manual step. `tools/ota/play-version-code.txt` is a number a person
has to remember to update after every upload, and on 2026-11-22 the thing it guards against
happened precisely because nobody had: EAS said 23 while Play already had 24. Asking Play is
the version of that check which cannot fall out of date.

It needs a Google Play service account with read access to the app -- see
tools/ota/README-play-service-account.md. Point it at the key with either:

    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/path/to/key.json        # a file
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='{"type":"service_...}'  # or the JSON itself,
                                                              # which is how CI holds it

Prints the number and exits 0. Prints nothing and exits 3 when no credential is configured,
which is NOT an error: the caller falls back to the tracked file. Any other failure prints a
reason to stderr and exits 2 -- a check that could not run must never be mistaken for a check
that passed, nor for one that found something.

Reading the catalogue requires an "edit", which is Play's transaction handle. One is opened
and then deleted; nothing is committed, so this cannot change anything about the listing.
"""
from __future__ import annotations

import json
import os
import sys

PACKAGE = os.environ.get("ANDROID_PACKAGE", "com.ejazzug.ejazzmedia")
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"


def fail(msg: str, code: int = 2):
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def credentials():
    raw = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise SystemExit(3)
    if raw.startswith("{"):
        try:
            info = json.loads(raw)
        except ValueError as err:
            fail("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON: %s" % err)
    else:
        if not os.path.exists(raw):
            fail("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON points at a file that does not exist: %s" % raw)
        with open(raw, encoding="utf-8") as handle:
            try:
                info = json.load(handle)
            except ValueError as err:
                fail("%s is not valid JSON: %s" % (raw, err))
    try:
        from google.oauth2 import service_account
    except ImportError:
        fail("google-auth is not installed (pip install google-auth)")
    try:
        return service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    except Exception as err:  # noqa: BLE001 - a malformed key is a configuration fault
        fail("that service account key was rejected: %s" % err)


def main() -> None:
    import requests
    from google.auth.transport.requests import Request as AuthRequest

    creds = credentials()
    creds.refresh(AuthRequest())
    headers = {"Authorization": "Bearer %s" % creds.token}

    created = requests.post("%s/%s/edits" % (API, PACKAGE), headers=headers, timeout=60)
    if created.status_code == 401:
        fail("Play refused the service account (401). Has it been granted access to %s in "
             "Play Console -> Users and permissions?" % PACKAGE)
    if created.status_code == 403:
        fail("Play accepted the account but not for this app (403). Grant it at least view "
             "access to %s." % PACKAGE)
    if not created.ok:
        fail("could not open a Play edit: %s %s" % (created.status_code, created.text[:200]))
    edit_id = created.json().get("id")

    codes: list[int] = []
    try:
        for kind in ("bundles", "apks"):
            resp = requests.get("%s/%s/edits/%s/%s" % (API, PACKAGE, edit_id, kind),
                                headers=headers, timeout=60)
            # A 404 here means "none of this kind have ever been uploaded", which is an
            # answer, not a failure -- an app can be all bundles and no apks.
            if resp.status_code == 404:
                continue
            if not resp.ok:
                fail("could not list %s: %s %s" % (kind, resp.status_code, resp.text[:200]))
            for item in resp.json().get(kind[:-1] + "s", []) or []:
                try:
                    codes.append(int(item.get("versionCode")))
                except (TypeError, ValueError):
                    continue
    finally:
        # Best effort: an abandoned edit expires on its own, but leaving them lying around
        # clutters the account and a later edit can collide with one.
        requests.delete("%s/%s/edits/%s" % (API, PACKAGE, edit_id), headers=headers, timeout=60)

    if not codes:
        fail("Play reports no uploaded bundles or apks for %s, which cannot be right for a "
             "published app -- refusing to answer 0." % PACKAGE)
    print(max(codes))


if __name__ == "__main__":
    main()
