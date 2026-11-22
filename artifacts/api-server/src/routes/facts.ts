import { Router, type IRouter } from "express";

import { cardFormat, cardRenderData, cardTemplate } from "../lib/cardTemplates";
import { factForTrack, pickWording, wordings } from "../lib/songFacts";

const router: IRouter = Router();

/**
 * The share picture for ONE fact.
 *
 * It is a path, not an absolute URL: the app already resolves every other path it is given
 * against its configured base, and this service does not know which hostname a phone reached
 * it on. Nothing is stored -- the card is drawn from the words in the query string, the same
 * way the Studio's preview pane draws an unsaved card (`cardRenderPath`). A fact that is
 * already a saved card keeps its own signed, stored image; this is for the listener who taps
 * share on the player.
 */
/**
 * The two stations a fact can be shared from, and what the card says it came from.
 *
 * A card that travels without saying where it is from is an advert for nobody (owner,
 * 2026-11-22). `logo` is the corner mark; the design has EJazz Radio's as its default, so an
 * unknown station still renders rather than failing.
 */
const STATIONS: Record<string, { name: string; logo: string }> = {
  radio: { name: "EJazz Radio", logo: "/opt/radio/podcasts/station_art/ejazz_radio.png" },
  xtra: { name: "EJazz Xtra", logo: "/opt/radio/podcasts/station_art/ejazz_xtra.png" },
};

function stationOf(raw: unknown): { name: string; logo: string } {
  const key = String(raw ?? "").trim().toLowerCase();
  // "extra" is what the app calls Xtra internally; both spellings answer, because a share
  // that drew the wrong station's logo would be worse than one that drew the default.
  if (key === "extra") return STATIONS.xtra;
  return STATIONS[key] || STATIONS.radio;
}

function sharePathFor(fact: string, song: string, artist: string, station: unknown): string | null {
  const template = cardTemplate("song-fact");
  if (!template) return null;
  const format = cardFormat(template, "1:1");
  const from = stationOf(station);
  const data = cardRenderData(template, {
    fact,
    song,
    artist,
    footer: `${from.name} on EJazz Media App`,
    logo: from.logo,
  });
  return "/api/designer/render/" + encodeURIComponent(format.design)
    + "?size=" + encodeURIComponent(format.size)
    + "&data=" + encodeURIComponent(JSON.stringify(data));
}

/**
 * Public, device-facing: the fact for the song on air, if there is one.
 * GET /api/facts/for-track?artist=...&title=...[&n=<which one>][&station=radio|xtra]
 * `station` only decides what the SHARE CARD says and which logo it carries; the fact itself
 * is the song's, and the same on either station.
 * Always 200 with {fact: null} when there is nothing to show -- the app hides the card.
 *
 * ONE FACT, NOT ALL OF THEM (owner, 2026-11-22). A stored row holds a bulleted list, and the
 * app used to print the whole string under "CLOCK THIS...". `wordings()` now splits that into
 * the separate facts it contains, and this route hands out one of them:
 *
 *   - no `n`      -- the rotation, so a song heard twice does not read the same line twice;
 *   - `n=<index>` -- that one, counted from 0 and wrapped, which is what the app's "another
 *                    one" tap sends. Wrapped rather than refused: the list can shrink between
 *                    two taps and a listener must never be shown an error for tapping.
 *
 * `total` is how many there are, so the app can offer another one and say where it is in the
 * list. The other facts' TEXT is not sent -- the listener is shown one at a time, and the app
 * asks again for the next.
 */
router.get("/for-track", async (req, res) => {
  const artist = typeof req.query.artist === "string" ? req.query.artist : "";
  const title = typeof req.query.title === "string" ? req.query.title : "";
  const asked = typeof req.query.n === "string" && req.query.n.trim() !== ""
    ? Number(req.query.n) : null;
  try {
    const fact = await factForTrack(artist, title);
    if (!fact) { res.json({ fact: null }); return; }
    const all = wordings(fact);
    if (!all.length) { res.json({ fact: null }); return; }
    let index: number;
    let body: string;
    if (asked !== null && Number.isFinite(asked)) {
      index = ((Math.trunc(asked) % all.length) + all.length) % all.length;
      body = all[index];
    } else {
      // `pickWording` rotates and owns its own cursor, so the index is read back off the text
      // it chose rather than kept twice.
      body = pickWording(fact);
      index = Math.max(0, all.indexOf(body));
    }
    // The id is still the fact's, not the line's: everything that acts on a fact later -- a
    // push to the hub, an edit, a card -- acts on the row.
    res.json({
      fact: {
        id: fact.id,
        body,
        source: fact.source,
        index,
        total: all.length,
        wordings: all.length,
        shareUrl: sharePathFor(body, title.trim(), artist.trim(), req.query.station),
      },
    });
  } catch {
    res.json({ fact: null });
  }
});

export default router;
