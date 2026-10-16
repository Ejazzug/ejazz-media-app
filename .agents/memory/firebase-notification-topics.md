---
name: EJazz FCM topic delivery
description: EJazz Android push topic names and the server-side delivery choice.
---

EJazz Android push uses Firebase Cloud Messaging topics `all`, `radio`, and `xtra`. The Android application ID is `com.ejazzug.ejazzmedia`. The Control Room sends to topics with Firebase Admin; client devices do not register Expo push tokens.

**Why:** the user chose topic-based FCM delivery instead of Expo push and a public client API URL for push.

**How to apply:** Keep Android topic subscriptions and Control Room audience selection aligned. Send a notification payload plus string-valued data fields through Firebase Admin.
