import { Router, type IRouter } from "express";
import { REQUESTS_PAGE } from "../lib/requestEmbedPage";

const router: IRouter = Router();


/**
 * GET /embed/requests?station=radio|xtra[&theme=light|dark]
 *
 * Deliberately framable (no X-Frame-Options / frame-ancestors): being embedded on the
 * station sites is the entire point. It carries no cookie, no session and no admin path,
 * so there is nothing for a frame to abuse.
 */
router.get("/requests", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  res.send(REQUESTS_PAGE);
});

export default router;
