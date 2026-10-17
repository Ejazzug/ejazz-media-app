import { Router, type IRouter } from "express";
import { DEFAULT_APP_CONFIG, getAppConfig, toPublicConfig } from "../lib/appConfig";

const router: IRouter = Router();

/**
 * Public, read-only app configuration. The mobile app calls this on launch and
 * whenever it returns to the foreground. If the database is unreachable we still
 * answer with safe defaults so the app keeps working.
 */
router.get("/", async (_req, res) => {
  let config = DEFAULT_APP_CONFIG;
  try {
    config = await getAppConfig();
  } catch (error) {
    console.error("[EJazz AppConfig] Could not read app config; serving defaults.", error);
  }
  res.set("Cache-Control", "public, max-age=30");
  res.json({ config: toPublicConfig(config), serverTime: new Date().toISOString() });
});

export default router;
