import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import {
  allowedDomain, headEmail, hashPassword, isCompanyEmail, normalizeEmail,
  notifyHeads, setSessionCookie, toUser,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const email = normalizeEmail(b.email);
    const name = String(b.name || "").trim();
    const password = String(b.password || "");

    if (!isCompanyEmail(email)) {
      return NextResponse.json({ error: `Use your @${allowedDomain()} email address.` }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "Your name is required." }, { status: 400 });
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) {
      return NextResponse.json({ error: "That address is already registered — sign in instead." }, { status: 409 });
    }

    /* The configured head is approved on sight; everyone else waits for them. */
    const isHead = !!headEmail() && email === headEmail();
    const [row] = await sql`
      INSERT INTO users (email, name, password_hash, role, status, approved_at, approved_by)
      VALUES (${email}, ${name}, ${hashPassword(password)},
              ${isHead ? "head" : "member"}, ${isHead ? "approved" : "pending"},
              ${isHead ? new Date().toISOString() : null}, ${isHead ? "system" : ""})
      RETURNING *
    `;

    if (!isHead) {
      await notifyHeads({
        actor: email,
        kind: "signup_request",
        title: `${name} is waiting for access`,
        body: `${email} registered and needs authorisation.`,
        refType: "user",
        refId: String(row.id),
      });
    }

    const res = NextResponse.json(toUser(row));
    return setSessionCookie(res, email, b.remember !== false);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
