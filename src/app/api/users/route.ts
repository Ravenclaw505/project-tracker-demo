import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireApproved } from "@/lib/auth";

/* The people you can assign work to: approved accounts only. */
export async function GET() {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT email, name, role FROM users
      WHERE status = 'approved'
      ORDER BY name ASC, email ASC
    `;
    return NextResponse.json(rows.map(r => ({
      email: String(r.email),
      name: String(r.name || r.email),
      role: String(r.role),
      isMe: String(r.email) === user.email,
    })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
