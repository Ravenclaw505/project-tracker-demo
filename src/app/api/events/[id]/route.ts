import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { eventRow, normalizeUrl } from "@/lib/rows";
import { requireApproved } from "@/lib/auth";

async function ownEvent(id: string, email: string) {
  const [row] = await sql`SELECT created_by FROM events WHERE id = ${id}`;
  if (!row) return "missing" as const;
  return String(row.created_by) === email ? ("ok" as const) : ("forbidden" as const);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const access = await ownEvent(id, user.email);
    if (access === "missing") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (access === "forbidden") return NextResponse.json({ error: "This is not your event." }, { status: 403 });

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
      UPDATE events SET
        title = ${String(b.title).trim()},
        event_type = ${b.eventType || "Meeting"},
        event_date = ${b.startDate},
        event_time = ${b.startTime || ""},
        end_date = ${b.endDate || null},
        end_time = ${b.endTime || ""},
        link = ${normalizeUrl(b.link)},
        notes = ${b.notes || ""}
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(eventRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const access = await ownEvent(id, user.email);
    if (access === "missing") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (access === "forbidden") return NextResponse.json({ error: "This is not your event." }, { status: 403 });
    await sql`DELETE FROM events WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
