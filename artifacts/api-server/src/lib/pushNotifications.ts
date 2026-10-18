import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { PushTopic } from "@workspace/db";
import { cleanHttpUrl, firstMarkupUrl, stripLinkMarkup } from "./linkText";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type PushDeliveryResult = {
  sent: boolean;
  topic: PushTopic;
  messageId: string | null;
  error: string | null;
};

function readFirebaseServiceAccount(): FirebaseServiceAccount {
  const configuredValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!configuredValue) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  }

  const json = existsSync(configuredValue)
    ? readFileSync(configuredValue, "utf8")
    : configuredValue;
  const account = JSON.parse(json) as Partial<FirebaseServiceAccount>;
  if (
    typeof account.project_id !== "string" ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  ) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required service-account fields.");
  }
  return account as FirebaseServiceAccount;
}

function getEJazzMessaging() {
  const appName = "ejazz-control-room";
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) return getMessaging(existingApp);

  const account = readFirebaseServiceAccount();
  const app = initializeApp(
    {
      credential: cert({
        projectId: account.project_id,
        clientEmail: account.client_email,
        privateKey: account.private_key,
      }),
      projectId: account.project_id,
    },
    appName,
  );
  return getMessaging(app);
}

export async function sendContentPush(input: {
  id: number;
  type: string;
  title: string;
  body: string | null;
  pushTopic: PushTopic;
  imageUrl?: string | null;
  linkUrl?: string | null;
  openMode?: string | null;
}): Promise<PushDeliveryResult> {
  const rawBody = input.body?.trim() ?? "";
  // The tray shows plain text; the markup survives in data so the app can render real links.
  const trayBody = stripLinkMarkup(rawBody) || "Open EJazz Media for the latest update.";
  const imageUrl = cleanHttpUrl(input.imageUrl);
  const linkUrl = cleanHttpUrl(input.linkUrl) ?? firstMarkupUrl(rawBody);
  const openMode = input.openMode === "link" && linkUrl ? "link" : "details";

  const messageId = await getEJazzMessaging().send({
    topic: input.pushTopic,
    notification: {
      title: input.title,
      body: trayBody,
      // Only https images: Android downloads and shows it as a large picture in the tray.
      ...(imageUrl && imageUrl.startsWith("https://") ? { imageUrl } : {}),
    },
    data: {
      type: "ejazz-content",
      contentId: String(input.id),
      contentType: input.type,
      openMode,
      // FCM data is capped (~4 KB for everything), so the text is bounded here.
      fullTitle: input.title.slice(0, 200),
      fullBody: rawBody.slice(0, 1800),
      ...(linkUrl ? { url: linkUrl } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "default",
        sound: "default",
      },
    },
  });

  return {
    sent: true,
    topic: input.pushTopic,
    messageId,
    error: null,
  };
}
