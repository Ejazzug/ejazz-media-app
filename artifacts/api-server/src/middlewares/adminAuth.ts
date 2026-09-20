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

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!verifySession(token)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
