import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SETTINGS_DEFAULTS, type SettingsKey } from "@/lib/constants";
import { requireApproved, requireHead } from "@/lib/auth";

const KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingsKey[];

export async function GET() {
  const { error } = await requireApproved();
  if (error) return error;
  try {
    const rows = await sql`SELECT key, value FROM app_settings`;
    const out: Record<string, string[]> = { ...SETTINGS_DEFAULTS };
    for (const r of rows) {
      const k = String(r.key);
      if (!KEYS.includes(k as SettingsKey)) continue;
      try {
        const parsed = JSON.parse(String(r.value));
        if (Array.isArray(parsed)) out[k] = parsed.map(String);
      } catch {
        // A malformed row falls back to the built-in defaults rather than breaking the page.
      }
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* These lists are shared by everyone, so only a head may change them. */
export async function PUT(req: NextRequest) {
  const { error } = await requireHead();
  if (error) return error;
  try {
    const b = await req.json();
    for (const k of KEYS) {
      if (!Array.isArray(b[k])) continue;
      const value = JSON.stringify(b[k].map(String));
      await sql`
        INSERT INTO app_settings (key, value, updated_at) VALUES (${k}, ${value}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
