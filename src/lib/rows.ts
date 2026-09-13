/* Shared row mappers: DB snake_case -> API camelCase. */

export function d(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    // Use local date parts so a DATE column never shifts a day across timezones.
    const p = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return p.toISOString().slice(0, 10);
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

/* Stored links always carry a scheme, however they were typed or posted. */
export function normalizeUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  try {
    const parsed = JSON.parse(String(v || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function projectRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    title: r.title || "",
    link: r.link || "",
    fileType: r.file_type || "",
    owner: r.owner || "",
    subOwners: list(r.sub_owners),
    status: r.status || "Not Started",
    startDate: d(r.start_date),
    endDate: d(r.end_date),
    notes: r.notes || "",
    createdAt: r.created_at ? String(r.created_at) : "",
    updatedAt: r.updated_at ? String(r.updated_at) : "",
  };
}

export function taskRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    title: r.title || "",
    notes: r.notes || "",
    assignedTo: r.assigned_to || "",
    createdBy: r.created_by || "",
    status: r.status || "To Do",
    dueDate: d(r.due_date),
    dueTime: r.due_time || "",
    completedAt: r.completed_at ? String(r.completed_at) : "",
    createdAt: r.created_at ? String(r.created_at) : "",
  };
}

export function eventRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    title: r.title || "",
    eventType: r.event_type || "Meeting",
    startDate: d(r.event_date),
    startTime: r.event_time || "",
    endDate: d(r.end_date),
    endTime: r.end_time || "",
    link: r.link || "",
    notes: r.notes || "",
    createdBy: r.created_by || "",
  };
}

export function notificationRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    actor: r.actor || "",
    kind: r.kind || "",
    title: r.title || "",
    body: r.body || "",
    refType: r.ref_type || "",
    refId: r.ref_id ? String(r.ref_id) : "",
    eventAt: r.event_at ? String(r.event_at) : "",
    readAt: r.read_at ? String(r.read_at) : "",
    createdAt: r.created_at ? String(r.created_at) : "",
  };
}
