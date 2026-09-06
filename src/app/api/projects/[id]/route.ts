import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeUrl, projectRow } from "@/lib/rows";
import { normalizeEmail, notify, requireApproved } from "@/lib/auth";

function subOwnersOf(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/* The owner and every sub-owner may edit; only the owner may delete. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const b = await req.json();
    const [existing] = await sql`SELECT * FROM projects WHERE id = ${id}`;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const owner = String(existing.owner || "");
    const currentSubs = subOwnersOf(existing.sub_owners);
    if (owner !== user.email && !currentSubs.includes(user.email)) {
      return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    }
    if (!b.title || !String(b.title).trim()) {
      return NextResponse.json({ error: "Project title is required" }, { status: 400 });
    }
    if (b.startDate && b.endDate && b.endDate < b.startDate) {
      return NextResponse.json({ error: "Ending date cannot be before the starting date" }, { status: 400 });
    }

    const raw: string[] = Array.isArray(b.subOwners) ? (b.subOwners as unknown[]).map(normalizeEmail) : [];
    const nextSubs: string[] = Array.isArray(b.subOwners)
      ? [...new Set(raw.filter(Boolean))].filter(e => e !== owner)
      : currentSubs;

    const [row] = await sql`
      UPDATE projects SET
        title = ${String(b.title).trim()},
        link = ${normalizeUrl(b.link)},
        file_type = ${b.fileType || ""},
        sub_owners = ${JSON.stringify(nextSubs)},
        status = ${b.status || "Not Started"},
        start_date = ${b.startDate || null},
        end_date = ${b.endDate || null},
        notes = ${b.notes || ""}
      WHERE id = ${id}
      RETURNING *
    `;

    // Only newly added people get told about it.
    for (const sub of nextSubs.filter(s => !currentSubs.includes(s))) {
      await notify({
        recipient: sub,
        actor: user.email,
        kind: "project_shared",
        title: `${user.name || user.email} added you to "${String(b.title).trim()}"`,
        body: "You can open and edit this project from your Projects tab.",
        refType: "project",
        refId: id,
        eventAt: b.endDate ? `${b.endDate}T09:30:00` : null,
      });
    }

    return NextResponse.json(projectRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const [existing] = await sql`SELECT owner FROM projects WHERE id = ${id}`;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (String(existing.owner) !== user.email) {
      return NextResponse.json({ error: "Only the project owner can delete it." }, { status: 403 });
    }
    await sql`DELETE FROM projects WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
