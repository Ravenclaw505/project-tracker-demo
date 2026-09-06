import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import {
  clearFailedLogins, LOCKOUT_MINUTES, lockoutMinutesLeft, normalizeEmail,
  recordFailedLogin, reconcileHead, setSessionCookie, toUser, verifyPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const email = normalizeEmail(b.email);
    const password = String(b.password || "");

    const [row] = await sql`SELECT * FROM users WHERE email = ${email}`;
    // Same message either way, so the form cannot be used to discover who has an account.
    if (!row) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const waitMinutes = lockoutMinutesLeft(row);
    if (waitMinutes > 0) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.` },
        { status: 429 }
      );
    }

    if (!verifyPassword(password, String(row.password_hash))) {
      await recordFailedLogin(email);
      const attemptsUsed = (Number(row.failed_attempts) || 0) + 1;
      const left = Math.max(0, 8 - attemptsUsed);
      return NextResponse.json(
        {
          error: left > 0 && left <= 3
            ? `Email or password is incorrect. ${left} attempt${left === 1 ? "" : "s"} left before a ${LOCKOUT_MINUTES}-minute lockout.`
            : "Email or password is incorrect.",
        },
        { status: 401 }
      );
    }

    await clearFailedLogins(email);
    const res = NextResponse.json(toUser(await reconcileHead(row)));
    return setSessionCookie(res, email, b.remember !== false);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
