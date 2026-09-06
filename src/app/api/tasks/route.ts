import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { taskRow } from "@/lib/rows";
import { normalizeEmail, notify, requireApproved } from "@/lib/auth";

/* You see a task if it is yours to do, or you handed it to someone else. */
export async function GET() {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT * FROM tasks
      WHERE assigned_to = ${user.email} OR created_by = ${user.email}
      ORDER BY due_date ASC NULLS LAST, due_time ASC, created_at ASC
    `;
    return NextResponse.json(rows.map(taskRow));
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
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }
    if (b.dueTime && !b.dueDate) {
      return NextResponse.json({ error: "Pick a due date for the time you set" }, { status: 400 });
    }
    const assignedTo = normalizeEmail(b.assignedTo) || user.email;
    const status = b.status === "Done" ? "Done" : "To Do";

    const [row] = await sql`
      INSERT INTO tasks (title, notes, assigned_to, created_by, status, due_date, due_time, completed_at)
      VALUES (${String(b.title).trim()}, ${b.notes || ""}, ${assignedTo}, ${user.email},
              ${status}, ${b.dueDate || null}, ${b.dueTime || ""},
              ${status === "Done" ? new Date().toISOString() : null})
      RETURNING *
    `;

    await notify({
      recipient: assignedTo,
      actor: user.email,
      kind: "task_assigned",
      title: `${user.name || user.email} assigned you a task`,
      body: String(b.title).trim(),
      refType: "task",
      refId: String(row.id),
      eventAt: b.dueDate ? `${b.dueDate}T${b.dueTime || "09:30"}:00` : null,
    });

    return NextResponse.json(taskRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
