import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { taskRow } from "@/lib/rows";
import { normalizeEmail, notify, requireApproved } from "@/lib/auth";

/* Assigner and assignee can both edit; only the assigner can delete. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const b = await req.json();
    const [existing] = await sql`SELECT * FROM tasks WHERE id = ${id}`;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const creator = String(existing.created_by || "");
    const assignee = String(existing.assigned_to || "");
    if (user.email !== creator && user.email !== assignee) {
      return NextResponse.json({ error: "You do not have access to this task." }, { status: 403 });
    }
    if (!b.title || !String(b.title).trim()) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }
    if (b.dueTime && !b.dueDate) {
      return NextResponse.json({ error: "Pick a due date for the time you set" }, { status: 400 });
    }

    // Only the person who handed the task out can hand it to somebody else.
    const nextAssignee = user.email === creator ? (normalizeEmail(b.assignedTo) || assignee) : assignee;
    const status = b.status === "Done" ? "Done" : "To Do";
    const completedAt =
      status === "Done" ? (existing.completed_at ?? new Date().toISOString()) : null;

    const [row] = await sql`
      UPDATE tasks SET
        title = ${String(b.title).trim()},
        notes = ${b.notes || ""},
        assigned_to = ${nextAssignee},
        status = ${status},
        due_date = ${b.dueDate || null},
        due_time = ${b.dueTime || ""},
        completed_at = ${completedAt}
      WHERE id = ${id}
      RETURNING *
    `;

    if (nextAssignee !== assignee) {
      await notify({
        recipient: nextAssignee,
        actor: user.email,
        kind: "task_assigned",
        title: `${user.name || user.email} assigned you a task`,
        body: String(b.title).trim(),
        refType: "task",
        refId: id,
        eventAt: b.dueDate ? `${b.dueDate}T${b.dueTime || "09:30"}:00` : null,
      });
    } else if (status === "Done" && String(existing.status) !== "Done" && creator !== user.email) {
      // Tell the assigner when their task gets finished by someone else.
      await notify({
        recipient: creator,
        actor: user.email,
        kind: "task_completed",
        title: `${user.name || user.email} completed a task you assigned`,
        body: String(b.title).trim(),
        refType: "task",
        refId: id,
      });
    }

    return NextResponse.json(taskRow(row));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireApproved();
  if (error) return error;
  try {
    const { id } = await params;
    const [existing] = await sql`SELECT created_by FROM tasks WHERE id = ${id}`;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (String(existing.created_by) !== user.email) {
      return NextResponse.json({ error: "Only the person who assigned this task can delete it." }, { status: 403 });
    }
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
