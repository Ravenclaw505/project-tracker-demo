import { NextResponse } from "next/server";
import sql from "@/lib/db";

const TABLES = ["users", "projects", "tasks", "events", "notifications", "project_files", "app_settings"];

export async function GET() {
  try {
    const rows = await sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY(${TABLES})
      ORDER BY table_name, ordinal_position
    `;
    const schema: Record<string, { column: string; type: string }[]> = {};
    for (const r of rows) {
      const t = String(r.table_name);
      if (!schema[t]) schema[t] = [];
      schema[t].push({ column: String(r.column_name), type: String(r.data_type) });
    }
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM tasks) AS tasks,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM notifications) AS notifications
    `.catch(() => [null]);
    return NextResponse.json({ schema, counts: counts ?? null });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    /* People. Registration is limited to the company domain; the head approves everyone else. */
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        name TEXT DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        status TEXT DEFAULT 'pending',
        approved_by TEXT DEFAULT '',
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    /* Brute-force protection for the public deployment. */
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ`;

    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        status TEXT DEFAULT 'Not Started',
        owner TEXT DEFAULT '',
        link TEXT DEFAULT '',
        start_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    /* Columns added as the spec grew. The ending date was called due_date in v1. */
    await sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='due_date')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='end_date')
        THEN
          ALTER TABLE projects RENAME COLUMN due_date TO end_date;
        END IF;
      END $$;
    `;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT ''`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS sub_owners TEXT DEFAULT '[]'`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;

    /* To-do items. created_by is the assigner, assigned_to the person who must do it. */
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'To Do',
        due_date DATE,
        due_time TEXT DEFAULT '',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT DEFAULT ''`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT ''`;

    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        event_type TEXT DEFAULT 'Meeting',
        event_date DATE NOT NULL,
        event_time TEXT DEFAULT '',
        end_date DATE,
        link TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT ''`;
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT ''`;

    /* Every alert a person sees: assignments, sub-owner invites, approvals. */
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient TEXT NOT NULL,
        actor TEXT DEFAULT '',
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        ref_type TEXT DEFAULT '',
        ref_id UUID,
        event_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_creator ON events(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient, created_at DESC)`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
