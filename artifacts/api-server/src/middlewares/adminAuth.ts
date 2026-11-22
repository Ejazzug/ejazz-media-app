import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const ADMIN_COOKIE = "ejazz_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set");
  }
  return secret;
}

export function signSession(): { token: string; maxAgeMs: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}`;
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, maxAgeMs: SESSION_TTL_MS };
}

function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  return Number(payload) > Date.now();
}

/**
 * THE ADMIN PASSWORD IS OFF. Every admin route is open to anyone who can reach it.
 *
 * Removed 2026-11-18 at the owner's explicit instruction, after being shown that
 * `https://control.ejazzug.com/api/admin/` answers from the open internet with no Cloudflare
 * Access in front of it, and that ADMIN_PASSWORD was the only thing guarding it. So this is
 * not a local convenience: the routes below this middleware are now reachable by anyone who
 * finds the address, and they can publish app content, **send a push notification to every
 * listener's phone**, and change facts, charts, logos and station settings.
 *
 * The session machinery above is left intact and working, so putting the gate back is one
 * edit: restore the body to
 *
 *     const token = req.cookies?.[ADMIN_COOKIE];
 *     if (!verifySession(token)) { res.status(401).json({ error: "unauthorized" }); return; }
 *     next();
 *
 * then `pnpm --filter @workspace/api-server build && systemctl restart ejazz-media`.
 *
 * The safer middle setting, if the point was only to stop typing the password on this box:
 * gate on the ABSENCE of `x-forwarded-for`, the way the designer routes already do here --
 * no password from the machine itself, password still required from the internet.
 */
export function requireAdmin(_req: Request, _res: Response, next: NextFunction) {
  next();
}

/** Kept so the gate above can be restored by putting its body back. Not currently called. */
void verifySession;
