import { Router, type IRouter } from "express";
import { factForTrack } from "../lib/songFacts";

const router: IRouter = Router();

/**
 * Public, device-facing: the fact for the song on air, if there is one.
 * GET /api/facts/for-track?artist=...&title=...
 * Always 200 with {fact: null} when there is nothing to show -- the app hides the card.
 */
router.get("/for-track", async (req, res) => {
  const artist = typeof req.query.artist === "string" ? req.query.artist : "";
  const title = typeof req.query.title === "string" ? req.query.title : "";
  try {
    const fact = await factForTrack(artist, title);
    res.json({ fact: fact ? { id: fact.id, body: fact.body, source: fact.source } : null });
  } catch {
    res.json({ fact: null });
  }
});

export default router;
