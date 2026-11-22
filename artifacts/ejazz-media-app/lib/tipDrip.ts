/**
 * TIPS, PACED PER LISTENER (owner, task #5: tips "delivered per user over time").
 *
 * A tip series is written once in the dashboard, but it must not arrive as a wall of twelve
 * tips the day someone installs the app. Everyone walks the same series in the same order,
 * from their OWN starting point: tip one on the day they first open the hub, the next a day
 * later, and so on.
 *
 * It is done on the device on purpose. The alternative is a per-listener cursor on the server,
 * which means identifying listeners and storing a row per person per tip -- for a drip whose
 * only job is pacing. The cost of keeping it local is that a reinstall starts the series over;
 * the cost of the server version is a user table.
 *
 * The clock starts on the first READ, not on install, so a listener who never opens the hub
 * has not burned their way through the series by waiting.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ejazz-tip-drip-v1';
/** One tip a day. */
export const DRIP_HOURS = 24;

/**
 * How many tips this listener has earned: one immediately, then one per `paceHours`.
 *
 * Capped at `total`, so a long-standing install sees the whole series including a tip added
 * today -- the drip paces a newcomer, it does not hold anything back from everyone else.
 * A clock that has gone backwards (a phone with the wrong date, then corrected) must never
 * REVOKE a tip, so a negative age counts as none elapsed rather than as a negative number.
 */
export function releasedTipCount(
  startedAt: number,
  now: number,
  total: number,
  paceHours: number = DRIP_HOURS,
): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return total;
  const elapsedHours = Math.max(0, (now - startedAt) / 3_600_000);
  const earned = 1 + Math.floor(elapsedHours / Math.max(1, paceHours));
  return Math.max(0, Math.min(total, earned));
}

/**
 * The ids this listener may see, oldest tip first.
 *
 * Order is the operator's: by when each tip was scheduled or made, so the series reads in the
 * order it was written rather than in id order, which a re-edit could shuffle.
 */
export function releasedTipIds(
  tips: ReadonlyArray<{ id: number; at: number }>,
  startedAt: number,
  now: number,
  paceHours: number = DRIP_HOURS,
): Set<number> {
  const ordered = [...tips].sort((a, b) => a.at - b.at);
  const count = releasedTipCount(startedAt, now, ordered.length, paceHours);
  return new Set(ordered.slice(0, count).map((tip) => tip.id));
}

/**
 * When this device's series started, writing it on the first call.
 *
 * A storage failure returns `now`, which releases the first tip and nothing else -- the
 * conservative answer, since the alternative (treating it as long ago) would dump the whole
 * series on someone whose storage is simply unavailable.
 */
export async function tipDripStartedAt(now: number = Date.now()): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(JSON.parse(raw)?.startedAt) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ startedAt: now }));
    return now;
  } catch {
    return now;
  }
}
