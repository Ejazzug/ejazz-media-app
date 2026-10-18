import { Router, type IRouter } from "express";
import { DEFAULT_APP_CONFIG, getAppConfig, toPublicConfig } from "../lib/appConfig";

const router: IRouter = Router();

const STATION_NAMES = { radio: "EJazz Radio", xtra: "EJazz Xtra" } as const;

/**
 * Public, read-only: is the station taking song requests right now, and when next?
 *
 * The website embed (GET /embed/requests) polls this so a form left open in a browser
 * tab closes itself when the window ends, and the app can read it for the same reason.
 * It is the same answer /api/app-config carries -- one computation, in toPublicConfig --
 * just addressable on its own, so an embed does not have to pull the whole app config.
 *
 * Unauthenticated on purpose: it says only whether requests are open and at what times,
 * which is exactly what a listener is told anyway.
 * GET /api/song-requests?station=radio|xtra
 */
router.get("/", async (req, res) => {
  const station = req.query.station === "xtra" ? "xtra" : req.query.station === "radio" ? "radio" : null;
  if (!station) {
    res.status(400).json({ error: "station must be radio or xtra" });
    return;
  }
  let config = DEFAULT_APP_CONFIG;
  try {
    config = await getAppConfig();
  } catch (error) {
    // Same stance as /api/app-config: answer with defaults rather than fail. The default
    // is "open", so a database blip does not close requests on every listener at once.
    console.error("[EJazz Requests] Could not read app config; serving defaults.", error);
  }
  const pub = toPublicConfig(config);
  const status = station === "xtra" ? pub.songRequests.xtraStatus : pub.songRequests.radioStatus;
  const open = pub.features.songRequests && (station === "xtra" ? pub.songRequests.xtraEnabled : pub.songRequests.radioEnabled);

  // 30s, matching /api/app-config: short enough that a window edge is never far off, long
  // enough that an embedded form on a busy page is not a request per visitor per poll.
  res.set("Cache-Control", "public, max-age=30");
  res.json({
    station,
    stationName: STATION_NAMES[station],
    open,
    mode: status.mode,
    closedMessage: pub.songRequests.closedMessage,
    closesAt: status.closesAt,
    opensAt: status.opensAt,
    nextChangeLabel: status.nextChangeLabel,
    schedule: status.schedule,
    serverTime: new Date().toISOString(),
  });
});

export default router;
