import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { notificationRow } from "@/lib/rows";
import { requireApproved } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT * FROM notifications
      WHERE recipient = ${user.email}
      ORDER BY created_at DESC
      LIMIT 300
    `;
    return NextResponse.json(rows.map(notificationRow));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* Mark one notification read, or all of them. */
export async function PUT(req: NextRequest) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const b = await req.json();
    if (b.all) {
      await sql`UPDATE notifications SET read_at = NOW() WHERE recipient = ${user.email} AND read_at IS NULL`;
    } else if (b.id) {
      await sql`
        UPDATE notifications SET read_at = NOW()
        WHERE id = ${String(b.id)} AND recipient = ${user.email} AND read_at IS NULL
      `;
    } else {
      return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });
    }
    const rows = await sql`
      SELECT * FROM notifications WHERE recipient = ${user.email}
      ORDER BY created_at DESC LIMIT 300
    `;
    return NextResponse.json(rows.map(notificationRow));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
