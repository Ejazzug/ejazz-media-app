/**
 * Tests for the Home card rail's SETTINGS -- the shape of the rail, which is all the Control
 * Room decides. Which cards are in it is the content feed's answer and the app's rule
 * (lib/homeCards.ts there), tested separately.
 *
 * The thing worth guarding is that a save can never quietly empty the rail: a blank box, a
 * stray word or a zero typed into "how many" must not take cards off Home, because nothing on
 * the page would say that is what happened.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppConfig, toPublicConfig, DEFAULT_APP_CONFIG } from "./appConfig";

test("the defaults are the three the owner asked for", () => {
  assert.deepEqual(DEFAULT_APP_CONFIG.homeCards, {
    enabled: true, max: 3, perCategory: 2, heading: "Fresh from EJazz",
  });
});

test("what an operator types is kept", () => {
  const saved = normalizeAppConfig({
    homeCards: { enabled: true, max: "4", perCategory: "1", heading: "On EJazz today" },
  });
  assert.deepEqual(saved.homeCards, {
    enabled: true, max: 4, perCategory: 1, heading: "On EJazz today",
  });
});

test("a blank or unreadable number box keeps the default, not the minimum", () => {
  // `Number("")` is 0, which once clamped to the minimum and cut the rail to a single card
  // for anyone whose saved config predates this section. Blank means "I did not say", and
  // the only honest answer to that is the default.
  for (const blank of ["", "   ", "lots", null, undefined, {}]) {
    const saved = normalizeAppConfig({ homeCards: { max: blank, perCategory: blank } });
    assert.equal(saved.homeCards.max, 3, `max for ${JSON.stringify(blank)}`);
    assert.equal(saved.homeCards.perCategory, 2, `perCategory for ${JSON.stringify(blank)}`);
  }
});

test("a zero or a negative is a number, and it clamps to one rather than emptying the rail", () => {
  // Typing 0 is not how the rail is switched off -- `enabled` is -- so it becomes the
  // smallest rail that still shows something, and the switch keeps saying what it says.
  const saved = normalizeAppConfig({ homeCards: { max: "0", perCategory: "-3" } });
  assert.equal(saved.homeCards.max, 1);
  assert.equal(saved.homeCards.perCategory, 1);
});

test("a huge number is clamped, not trusted", () => {
  const saved = normalizeAppConfig({ homeCards: { max: "999", perCategory: 99 } });
  assert.equal(saved.homeCards.max, 6);
  assert.equal(saved.homeCards.perCategory, 6);
});

test("a blank heading falls back to the default, never to nothing", () => {
  const saved = normalizeAppConfig({ homeCards: { heading: "   " } });
  assert.equal(saved.homeCards.heading, DEFAULT_APP_CONFIG.homeCards.heading);
});

test("switching the rail off is the switch, and it is honoured", () => {
  const saved = normalizeAppConfig({ homeCards: { enabled: false } });
  assert.equal(saved.homeCards.enabled, false);
});

test("a missing section is the defaults, so an old saved config keeps working", () => {
  const saved = normalizeAppConfig({ features: { news: true } });
  assert.deepEqual(saved.homeCards, DEFAULT_APP_CONFIG.homeCards);
});

test("the phone is told the rail's settings", () => {
  const saved = normalizeAppConfig({ homeCards: { max: "2", heading: "Hot right now" } });
  const sent = toPublicConfig(saved, new Date("2026-11-23T12:00:00.000Z")) as Record<string, unknown>;
  assert.deepEqual(sent.homeCards, {
    enabled: true, max: 2, perCategory: 2, heading: "Hot right now",
  });
});
