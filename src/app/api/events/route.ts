import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { eventRow, normalizeUrl } from "@/lib/rows";
import { requireApproved } from "@/lib/auth";

/* Calendar visibility: your own events only. */
export async function GET() {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT * FROM events
      WHERE created_by = ${user.email}
      ORDER BY event_date ASC, event_time ASC
    `;
    return NextResponse.json(rows.map(eventRow));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const b = await req.json();
    if (!b.title || !String(b.title).trim()) {
      return NextResponse.json({ error: "Event title is required" }, { status: 400 });
    }
    if (!b.startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }
    if (b.endDate && b.endDate < b.startDate) {
      return NextResponse.json({ error: "End date cannot be before the start date" }, { status: 400 });
    }
    const [row] = await sql`
      INSERT INTO events (title, event_type, event_date, event_time, end_date, end_time, link, notes, created_by)
      VALUES (${String(b.title).trim()}, ${b.eventType || "Meeting"}, ${b.startDate}, ${b.startTime || ""},
              ${b.endDate || null}, ${b.endTime || ""}, ${normalizeUrl(b.link)}, ${b.notes || ""}, ${user.email})
      RETURNING *
    `;
    return NextResponse.json(eventRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
