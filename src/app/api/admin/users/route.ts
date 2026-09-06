import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { notify, requireHead } from "@/lib/auth";

export async function GET() {
  const { error } = await requireHead();
  if (error) return error;
  try {
    const rows = await sql`
      SELECT id, email, name, role, status, approved_by, approved_at, created_at
      FROM users ORDER BY created_at ASC
    `;
    return NextResponse.json(rows.map(r => ({
      id: String(r.id),
      email: String(r.email),
      name: String(r.name || ""),
      role: String(r.role),
      status: String(r.status),
      approvedBy: String(r.approved_by || ""),
      createdAt: r.created_at ? String(r.created_at) : "",
    })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* Head-only membership control: approve, revoke, restore, or hand over head rights. */
export async function PUT(req: NextRequest) {
  const { user, error } = await requireHead();
  if (error) return error;
  try {
    const b = await req.json();
    const id = String(b.id || "");
    const action = String(b.action || "");
    const [target] = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!target) return NextResponse.json({ error: "No such person" }, { status: 404 });

    const targetEmail = String(target.email);
    if (targetEmail === user.email && (action === "block" || action === "demote")) {
      return NextResponse.json({ error: "You cannot remove your own access." }, { status: 400 });
    }

    if (action === "approve") {
      await sql`
        UPDATE users SET status = 'approved', approved_by = ${user.email}, approved_at = NOW()
        WHERE id = ${id}
      `;
      await notify({
        recipient: targetEmail,
        actor: user.email,
        kind: "access_approved",
        title: "Your access was approved",
        body: `${user.name || user.email} authorised your account. Welcome in.`,
        refType: "user",
        refId: id,
      });
    } else if (action === "block") {
      await sql`UPDATE users SET status = 'blocked' WHERE id = ${id}`;
    } else if (action === "unblock") {
      await sql`UPDATE users SET status = 'approved' WHERE id = ${id}`;
    } else if (action === "promote") {
      await sql`UPDATE users SET role = 'head', status = 'approved' WHERE id = ${id}`;
      await notify({
        recipient: targetEmail,
        actor: user.email,
        kind: "role_changed",
        title: "You are now a head",
        body: "You can authorise new people from Settings.",
        refType: "user",
        refId: id,
      });
    } else if (action === "demote") {
      await sql`UPDATE users SET role = 'member' WHERE id = ${id}`;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const [row] = await sql`SELECT id, email, name, role, status FROM users WHERE id = ${id}`;
    return NextResponse.json({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name || ""),
      role: String(row.role),
      status: String(row.status),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
