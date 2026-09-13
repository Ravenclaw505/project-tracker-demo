import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeUrl, projectRow } from "@/lib/rows";
import { normalizeEmail, notify, requireApproved } from "@/lib/auth";

/* You see a project if you own it or were named a sub-owner. */
export async function GET() {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT * FROM projects
      WHERE owner = ${user.email}
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(sub_owners::jsonb) AS s(email)
              WHERE s.email = ${user.email}
            )
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    `;
    return NextResponse.json(rows.map(projectRow));
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
      return NextResponse.json({ error: "Project title is required" }, { status: 400 });
    }
    if (b.startDate && b.endDate && b.endDate < b.startDate) {
      return NextResponse.json({ error: "Ending date cannot be before the starting date" }, { status: 400 });
    }
    const raw: string[] = Array.isArray(b.subOwners) ? (b.subOwners as unknown[]).map(normalizeEmail) : [];
    const subOwners = [...new Set(raw.filter(Boolean))].filter(e => e !== user.email);

    const [row] = await sql`
      INSERT INTO projects (title, link, file_type, owner, sub_owners, status, start_date, end_date, notes, updated_at)
      VALUES (${String(b.title).trim()}, ${normalizeUrl(b.link)}, ${b.fileType || ""}, ${user.email},
              ${JSON.stringify(subOwners)}, ${b.status || "Not Started"},
              ${b.startDate || null}, ${b.endDate || null}, ${b.notes || ""}, NOW())
      RETURNING *
    `;

    for (const sub of subOwners) {
      await notify({
        recipient: sub,
        actor: user.email,
        kind: "project_shared",
        title: `${user.name || user.email} added you to "${String(b.title).trim()}"`,
        body: "You can open and edit this project from your Projects tab.",
        refType: "project",
        refId: String(row.id),
        eventAt: b.endDate ? `${b.endDate}T09:30:00` : null,
      });
    }

    return NextResponse.json(projectRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
