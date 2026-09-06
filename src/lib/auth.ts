import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import sql from "@/lib/db";

export const SESSION_COOKIE = "pt_session";
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 365; // "keep me signed in on this device"

export type Role = "head" | "member";
export type UserStatus = "pending" | "approved" | "blocked";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
};

export function allowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN || "pathao.com").toLowerCase();
}

export function headEmail() {
  return (process.env.HEAD_EMAIL || "").trim().toLowerCase();
}

export function normalizeEmail(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase();
}

export function isCompanyEmail(email: string) {
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.endsWith("@" + allowedDomain());
}

/* ── Passwords: scrypt with a per-user salt ── */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ── Session cookie: base64url payload + HMAC signature ── */
function secret() {
  return process.env.SESSION_SECRET || "development-only-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, at: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  // Compare as buffers of equal length to avoid leaking timing information.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, email: string, remember: boolean) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(email),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // HTTPS-only once deployed; plain http keeps working for local development.
    secure: process.env.NODE_ENV === "production",
    // No maxAge means the cookie dies with the browser session.
    ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export function toUser(r: Record<string, unknown>): SessionUser {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name || ""),
    role: (r.role === "head" ? "head" : "member") as Role,
    status: (r.status as UserStatus) || "pending",
  };
}

/* Keeps the configured head in step with HEAD_EMAIL, even when that address
   registered before it was set or was pointed at an existing account. */
export async function reconcileHead(row: Record<string, unknown>) {
  const head = headEmail();
  if (!head || String(row.email) !== head) return row;
  if (row.role === "head" && row.status === "approved") return row;
  const [updated] = await sql`
    UPDATE users SET role = 'head', status = 'approved',
      approved_by = 'system', approved_at = COALESCE(approved_at, NOW())
    WHERE email = ${head}
    RETURNING *
  `;
  return updated ?? row;
}

/* Returns the signed-in user whatever their state — pending users included. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const email = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!email) return null;
  const [row] = await sql`SELECT * FROM users WHERE email = ${email}`;
  return row ? toUser(await reconcileHead(row)) : null;
}

/* Guard for every data route: only approved accounts get through. */
export async function requireApproved(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await currentUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  if (user.status !== "approved") {
    return {
      user: null,
      error: NextResponse.json(
        { error: user.status === "blocked" ? "Access revoked" : "Waiting for approval" },
        { status: 403 }
      ),
    };
  }
  return { user, error: null };
}

export async function requireHead(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const res = await requireApproved();
  if (res.error) return res;
  if (res.user.role !== "head") {
    return { user: null, error: NextResponse.json({ error: "Head access only" }, { status: 403 }) };
  }
  return res;
}

/* ── Sign-in throttling ──
   Once the app is on the public internet a password can be guessed at machine
   speed, so failures are counted per account and the account stops answering
   for a while. Counters live in the database because serverless functions do
   not share memory. */
export const MAX_FAILED_ATTEMPTS = 8;
export const LOCKOUT_MINUTES = 15;

export function lockoutMinutesLeft(row: Record<string, unknown>): number {
  const attempts = Number(row.failed_attempts) || 0;
  if (attempts < MAX_FAILED_ATTEMPTS || !row.last_failed_at) return 0;
  const since = Date.now() - new Date(String(row.last_failed_at)).getTime();
  const left = LOCKOUT_MINUTES * 60000 - since;
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

export async function recordFailedLogin(email: string) {
  // The window rolls: a failure more than the lockout apart starts a new count.
  await sql`
    UPDATE users SET
      failed_attempts = CASE
        WHEN last_failed_at IS NULL
          OR last_failed_at < NOW() - (${LOCKOUT_MINUTES}::int * INTERVAL '1 minute')
          THEN 1
        ELSE COALESCE(failed_attempts, 0) + 1
      END,
      last_failed_at = NOW()
    WHERE email = ${email}
  `;
}

export async function clearFailedLogins(email: string) {
  await sql`UPDATE users SET failed_attempts = 0, last_failed_at = NULL WHERE email = ${email}`;
}

/* ── Notifications ── */
export async function notify(opts: {
  recipient: string;
  actor: string;
  kind: string;
  title: string;
  body?: string;
  refType?: string;
  refId?: string | null;
  eventAt?: string | null;
}) {
  const recipient = normalizeEmail(opts.recipient);
  if (!recipient || recipient === normalizeEmail(opts.actor)) return; // never notify yourself
  await sql`
    INSERT INTO notifications (recipient, actor, kind, title, body, ref_type, ref_id, event_at)
    VALUES (${recipient}, ${normalizeEmail(opts.actor)}, ${opts.kind}, ${opts.title},
            ${opts.body || ""}, ${opts.refType || ""}, ${opts.refId || null}, ${opts.eventAt || null})
  `;
}

export async function notifyHeads(opts: Omit<Parameters<typeof notify>[0], "recipient">) {
  const heads = await sql`SELECT email FROM users WHERE role = 'head' AND status = 'approved'`;
  for (const h of heads) {
    await notify({ ...opts, recipient: String(h.email) });
  }
}
