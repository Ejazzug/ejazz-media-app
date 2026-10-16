import { Router, type IRouter } from "express";
import { db, expoPushTokensTable } from "@workspace/db";

const router: IRouter = Router();
const EXPO_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[^\]]+\]$/;

router.post("/register", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = req.body?.platform;

  if (token.length > 512 || !EXPO_TOKEN_PATTERN.test(token)) {
    res.status(400).json({ error: "A valid Expo push token is required." });
    return;
  }
  if (platform !== "android" && platform !== "ios") {
    res.status(400).json({ error: "A supported device platform is required." });
    return;
  }

  await db
    .insert(expoPushTokensTable)
    .values({ token, platform, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: expoPushTokensTable.token,
      set: { platform, updatedAt: new Date() },
    });
  res.status(204).end();
});

export default router;
