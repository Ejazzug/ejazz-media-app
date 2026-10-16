import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { PushTopic } from "@workspace/db";

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
}): Promise<PushDeliveryResult> {
  const messageId = await getEJazzMessaging().send({
    topic: input.pushTopic,
    notification: {
      title: input.title,
      body: input.body?.trim() || "Open EJazz Media for the latest update.",
    },
    data: {
      type: "ejazz-content",
      contentId: String(input.id),
      contentType: input.type,
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
