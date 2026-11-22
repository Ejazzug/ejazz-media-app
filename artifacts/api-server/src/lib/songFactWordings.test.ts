/**
 * Tests for more than one wording per song: `wordings`, `pickWording` and the two guards
 * that decide whether a rephrasing may be kept.
 *
 *   npx esbuild src/lib/songFactWordings.test.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/t.cjs
 *   DATABASE_URL="postgres://unused:unused@127.0.0.1:1/none" NODE_ENV=production node /tmp/t.cjs
 *
 * **It imports the real `songFacts.ts`** rather than keeping a copy of it here. That is not
 * tidiness. The first version of this file copied the implementation in, including a
 * `.replace(/["']+$/)` that stripped the closing quotation mark off any fact ENDING in a
 * quote -- so the copy reproduced the bug perfectly and agreed with itself. A test that
 * restates the code can only ever confirm what the author already believed.
 *
 * `DATABASE_URL` is a dead address: drizzle connects lazily, and nothing here runs a query.
 * `rephraseFact` itself is not called -- it reads and writes rows -- so what is checked is
 * the pure half: every wording, the rotation, and the number and quote guards that decide
 * what a rephrasing is allowed to change. Nothing reaches Groq.
 */
import assert from "node:assert";
import { MAX_WORDINGS, demarkdown, factLines, isWholeFact, nameTheSubject, pickWording, unwrap, wordings } from "./songFacts";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (e as Error).message);
  }
}

type Row = Parameters<typeof wordings>[0];
const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  body: "Recorded the vocal in a bathroom in 2018.",
  variants: null,
  ...over,
}) as unknown as NonNullable<Row>;

// The two guards, as `rephraseFact` applies them. Kept in step with the module by the tests
// below, which assert on the behaviour they produce rather than on these expressions.
const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).sort().join(",");
const quotesIn = (s: string) => (s.match(/["“]([^"”]{8,240})["”]/g) ?? []).join("|");
const faithful = (before: string, after: string) =>
  numbersIn(before) === numbersIn(after) && quotesIn(before) === quotesIn(after);

console.log("every wording");
test("one fact is one wording", () => {
  assert.deepEqual(wordings(row()), ["Recorded the vocal in a bathroom in 2018."]);
});
// The fixtures below are whole sentences, not "A." / "B.": since 2026-11-23 a wording under
// fifteen characters is treated as a fragment and dropped (isWholeFact), the same floor the
// writer already applied to `body`.
test("body comes first, variants follow in order", () => {
  assert.deepEqual(wordings(row({ body: "The first wording, long enough to count.", variants: ["The second wording, long enough to count.", "The third wording, long enough to count."] })), ["The first wording, long enough to count.", "The second wording, long enough to count.", "The third wording, long enough to count."]);
});
test("a repeated wording is dropped, whatever its case", () => {
  assert.deepEqual(
    wordings(row({ body: "A fact long enough to count.", variants: ["a FACT LONG enough to count.", "The second wording, long enough to count."] })),
    ["A fact long enough to count.", "The second wording, long enough to count."]);
});
test("blank variants are ignored", () => {
  assert.deepEqual(wordings(row({ body: "The first wording, long enough to count.", variants: ["", "   ", "The second wording, long enough to count."] })), ["The first wording, long enough to count.", "The second wording, long enough to count."]);
});
test("a no-fact marker has no wordings at all", () => {
  assert.deepEqual(wordings(row({ body: "", variants: ["The second wording, long enough to count."] })), []);
});
test("nothing is not a crash", () => {
  assert.deepEqual(wordings(null), []);
});
test("never more than the cap", () => {
  assert.equal(wordings(row({
    variants: ["Wording b, long enough.", "Wording c, long enough.", "Wording d, long enough.",
               "Wording e, long enough.", "Wording f, long enough.", "Wording g, long enough."],
  })).length, MAX_WORDINGS);
});

console.log("rotation");
test("a song with one wording always shows it", () => {
  const r = row({ id: 101 });
  assert.equal(pickWording(r), r.body);
  assert.equal(pickWording(r), r.body);
  assert.equal(pickWording(r), r.body);
});
test("a song with three rotates through all of them and comes back round", () => {
  const r = row({ id: 102, body: "The first wording, long enough to count.", variants: ["The second wording, long enough to count.", "The third wording, long enough to count."] });
  assert.deepEqual([pickWording(r), pickWording(r), pickWording(r), pickWording(r)],
                   ["The first wording, long enough to count.", "The second wording, long enough to count.", "The third wording, long enough to count.", "The first wording, long enough to count."]);
});
test("the second play of a song is never the same sentence as the first", () => {
  const r = row({ id: 103, body: "The first wording, long enough to count.", variants: ["The second wording, long enough to count."] });
  assert.notEqual(pickWording(r), pickWording(r));
});
test("two songs rotate independently", () => {
  const a = row({ id: 104, body: "Song A, wording one.", variants: ["Song A, wording two."] });
  const b = row({ id: 105, body: "Song B, wording one.", variants: ["Song B, wording two."] });
  assert.equal(pickWording(a), "Song A, wording one.");
  assert.equal(pickWording(b), "Song B, wording one.");
  assert.equal(pickWording(a), "Song A, wording two.");
  assert.equal(pickWording(b), "Song B, wording two.");
});
test("nothing to show is an empty string", () => {
  assert.equal(pickWording(null), "");
  assert.equal(pickWording(row({ id: 106, body: "" })), "");
});

console.log("trimming a reply");
test("a reply wrapped in quotes is unwrapped", () => {
  assert.equal(unwrap('"Recorded in a bathroom."'), "Recorded in a bathroom.");
});
test("a reply that ENDS in a quotation keeps its closing mark", () => {
  // The bug this file was written to catch: a blanket trailing-quote strip left the
  // sentence unbalanced AND hid the quote from the guard, so a reply that really had
  // altered the quoted words would have been stored as faithful.
  const r = unwrap('Tems said: "I kept going and it worked."');
  assert.equal(r, 'Tems said: "I kept going and it worked."');
  assert.equal((r.match(/"/g) ?? []).length, 2);
});
test("a reply that starts with a quotation keeps its opening mark", () => {
  assert.equal(unwrap('"I kept going," Tems said.'), '"I kept going," Tems said.');
});
test("whitespace is collapsed", () => {
  assert.equal(unwrap("  Recorded   in \n a bathroom.  "), "Recorded in a bathroom.");
});
test("nothing in, nothing out", () => {
  assert.equal(unwrap(""), "");
});

console.log("what a rephrasing may change");
const FACT = "Recorded the vocal in a bathroom in 2018.";
test("different words, same claim: kept", () => {
  assert.ok(faithful(FACT, "She cut that breathy vocal in a bathroom back in 2018."));
});
test("a moved year: refused", () => {
  assert.ok(!faithful(FACT, "She cut that breathy vocal in a bathroom back in 2019."));
});
test("a dropped number: refused", () => {
  assert.ok(!faithful(FACT, "She cut that breathy vocal in a bathroom."));
});
test("an added number: refused", () => {
  assert.ok(!faithful(FACT, "She cut 2 vocals in a bathroom in 2018."));
});
test("the same quote reworded around it: kept", () => {
  const q = 'Tems said: "I kept going and it worked."';
  assert.ok(faithful(q, 'As Tems put it: "I kept going and it worked."'));
});
test("altered quoted words: refused", () => {
  const q = 'Tems said: "I kept going and it worked."';
  assert.ok(!faithful(q, 'Tems said: "I never once stopped trying."'));
});
test("a quote dropped altogether: refused", () => {
  const q = 'Tems said: "I kept going and it worked."';
  assert.ok(!faithful(q, "Tems said she kept going and it worked."));
});

// ---------------------------------------------------------------- markdown
// A card SHOWED this: the Lil Mama fact drew as "...album *Sweet & Sour*." with the asterisks
// on the picture. Groq is asked for prose and answers with markdown often enough that the
// strip has to live on this side too, not only in the dashboard's tidy pass.
test("the fact that reached a card", () => {
  const body = "Lil Mama, a collaboration with Nasty C, was released in 2022 as a single "
    + "from Cassper Nyovest's album *Sweet & Sour*.";
  const got = demarkdown(body);
  assert.ok(!got.includes("*"), got);
  assert.ok(got.includes("album Sweet & Sour."), got);
});
test("every emphasis marker", () => {
  const want = "Essence was released in 2020.";
  for (const body of ["**Essence** was released in 2020.", "*Essence* was released in 2020.",
                      "__Essence__ was released in 2020.", "_Essence_ was released in 2020.",
                      "`Essence` was released in 2020."]) {
    assert.strictEqual(demarkdown(body), want, body);
  }
});
test("a link keeps the words and drops the url", () => {
  assert.strictEqual(demarkdown("See [Calm Down](https://example.com/x) for more."),
                     "See Calm Down for more.");
});
test("nesting", () => {
  assert.strictEqual(demarkdown("**a *b* c**"), "a b c");
});
test("what must NOT be touched", () => {
  for (const body of ["The file Sweet_Sour_mix was leaked.", "A 5 * 4 beat pattern.",
                      'Tems told Apple Music: "I kept going."', "Released 2 * 3 weeks later.",
                      "Mixed by Spax_"]) {
    assert.strictEqual(demarkdown(body), body, body);
  }
});
test("a clean fact comes back byte-identical", () => {
  const body = "Essence was released in 2020.";
  assert.strictEqual(demarkdown(body), body);
});
test("markdown round the whole reply still unwraps the quotation marks", () => {
  // The reason `rephraseFact` runs demarkdown BEFORE unwrap and not after.
  assert.strictEqual(unwrap(demarkdown('*"Essence was released in 2020."*')),
                     "Essence was released in 2020.");
});
test("markdown round the quote does not hide it from the guard", () => {
  const q = 'Tems said: "I kept going and it worked."';
  assert.ok(faithful(q, demarkdown('As Tems put it: *"I kept going and it worked."*')));
  assert.ok(!faithful(q, demarkdown('Tems said: **"I never once stopped trying."**')));
});

console.log(failed ? `FAILED: ${passed} passed, ${failed} failed` : `OK: ${passed} passed, 0 failed`);
if (failed) process.exitCode = 1;

// ===========================================================================
// One fact at a time (owner, 2026-11-22: "clock this shows all facts i need the system to
// show one fact at a time"). The generator writes a BULLETED LIST into one body, and the app
// printed the whole string. `factLines` is what splits it; `wordings` is what hands them out
// one at a time.
// ===========================================================================
{
  // a real body, copied from the table
  const bulleted = "• 'The Middle' showcases crossover appeal, gaining traction through "
    + "radio airplay. • Zedd blends pop-R&B production with melody-driven songwriting. "
    + "• Tracks like this one anchor the late-night rotation.";
  const lines = factLines(bulleted);
  assert.equal(lines.length, 3, "a three-bullet body is three facts");
  assert.ok(lines[0].startsWith("'The Middle' showcases"), "the bullet itself is not kept");
  assert.ok(!lines.some((l) => l.includes("•")), "no fact carries a bullet");

  // a plain sentence is ONE fact and is not touched
  const plain = "Tems recorded the vocal in one take.";
  assert.deepEqual(factLines(plain), [plain]);

  // a hyphen inside a sentence is not a separator -- only one at the start of a line is
  assert.deepEqual(factLines("A chart-topping, well-known single."),
                   ["A chart-topping, well-known single."]);
  assert.equal(factLines("- first fact\n- second fact").length, 2);
  assert.equal(factLines("first\nsecond\nthird").length, 3);
  assert.deepEqual(factLines(""), []);
  assert.deepEqual(factLines(null), []);

  // and the route's view of it: one fact per entry, rotating
  const row = { id: 7, body: bulleted, variants: [] } as unknown as Parameters<typeof wordings>[0];
  const all = wordings(row);
  assert.equal(all.length, 3, "wordings splits the bullets too");
  assert.ok(all.every((w) => w.length < bulleted.length), "no entry is the whole blob");
  const first = pickWording(row);
  const second = pickWording(row);
  assert.notEqual(first, second, "two plays do not read the same fact");
  assert.ok(all.includes(first) && all.includes(second));

  // the cap still holds when a body of bullets is joined by variants
  const many = { id: 8, body: bulleted, variants: ["• four • five • six"] } as unknown as Parameters<typeof wordings>[0];
  assert.ok(wordings(many).length <= MAX_WORDINGS, "the wording cap still holds");

  console.log("one-fact-at-a-time: ok");
}

// --- a wording that was cut mid-sentence is not shown (owner, 2026-11-23) ---
{
  const row = (over: Record<string, unknown>) =>
    ({ id: 90, artist: "Spice Diana", body: "A fact long enough to count.", ...over }) as unknown as Parameters<typeof wordings>[0];

  assert.equal(isWholeFact("She first broke into the scene in 2014 after..."), false, "an ellipsis means cut");
  assert.equal(isWholeFact("Ends in a real stop."), true);
  assert.equal(isWholeFact("..."), false, "72 rows held exactly this");
  assert.equal(isWholeFact("Too short."), false, "under the 15-character floor");

  const cut = wordings(row({ variants: ["She first broke into the Kampala scene in 2014 after...", "..."] }));
  assert.deepEqual(cut, ["A fact long enough to count."], "only the whole fact survives");

  // A body is shown even when it would fail the test: it is what every other reader shows.
  assert.deepEqual(wordings(row({ body: "Cut off here...", variants: [] })), ["Cut off here..."]);

  console.log("cut wordings: ok");
}

// --- a fact that opens with a pronoun says who it is about ---
{
  assert.equal(nameTheSubject("She first broke into the scene in 2014.", "Spice Diana"),
    "Spice Diana first broke into the scene in 2014.");
  assert.equal(nameTheSubject("They recorded it in one take.", "Sauti Sol"),
    "Sauti Sol recorded it in one take.");
  assert.equal(nameTheSubject("Her debut single sold out.", "Azawi"), "Azawi's debut single sold out.");
  assert.equal(nameTheSubject("His first show was in Gulu.", "Lucky Dube"), "Lucky Dube's first show was in Gulu.");
  assert.equal(nameTheSubject("Their tour began in Jinja.", "The Mith"), "The Mith's tour began in Jinja.");
  // A name already ending in s takes the bare apostrophe.
  assert.equal(nameTheSubject("His verse closes the record.", "Navio Travis"), "Navio Travis' verse closes the record.");
  // Already named, or not a pronoun at all: left exactly as written.
  assert.equal(nameTheSubject("She wrote it for Azawi.", "Azawi"), "She wrote it for Azawi.");
  assert.equal(nameTheSubject("Recorded in one take.", "Azawi"), "Recorded in one take.");
  assert.equal(nameTheSubject("Sheebah opened the show.", "Spice Diana"), "Sheebah opened the show.",
    "a name that merely starts with she- is not a pronoun");
  assert.equal(nameTheSubject("She sang it live.", ""), "She sang it live.", "no artist, no rewrite");

  const named = wordings({ id: 91, artist: "Spice Diana",
    body: "She first broke into the scene in 2014 and never left.", variants: [] } as unknown as Parameters<typeof wordings>[0]);
  assert.deepEqual(named, ["Spice Diana first broke into the scene in 2014 and never left."]);

  console.log("named subjects: ok");
}
