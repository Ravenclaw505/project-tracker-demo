"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard, ListChecks, FolderKanban, CalendarDays, SettingsIcon, Bell,
  Plus, Pencil, Trash2, ExternalLink, X, Check, ChevronLeft, ChevronRight, ChevronDown,
  AlertTriangle, Database, RotateCw, Clock, LogOut, ShieldCheck, UserPlus, Users, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS, STATUS_COLOR, EVENT_COLOR, MONTHS, WEEKDAYS, SETTINGS_DEFAULTS,
  DEFAULT_EVENT_TIME, INK, ACCENT, DANGER, OK, type SettingsKey,
} from "@/lib/constants";

/* ── Types ── */
type Me = { id: string; email: string; name: string; role: "head" | "member"; status: "pending" | "approved" | "blocked" };
type Person = { email: string; name: string; role: string; isMe: boolean };
type Project = {
  id: string; title: string; link: string; fileType: string; owner: string; subOwners: string[];
  status: string; startDate: string; endDate: string; notes: string; createdAt: string;
};
type Task = {
  id: string; title: string; notes: string; assignedTo: string; createdBy: string;
  status: string; dueDate: string; dueTime: string; completedAt: string; createdAt: string;
};
type Evt = {
  id: string; title: string; eventType: string; startDate: string; startTime: string;
  endDate: string; endTime: string; link: string; notes: string; createdBy: string;
};
type Notif = {
  id: string; actor: string; kind: string; title: string; body: string;
  refType: string; refId: string; eventAt: string; readAt: string; createdAt: string;
};
type Member = { id: string; email: string; name: string; role: string; status: string; approvedBy?: string; createdAt?: string };
type Settings = Record<SettingsKey, string[]>;
type View = "dashboard" | "tasks" | "projects" | "calendar" | "notifications" | "settings";

const EMPTY_PROJECT: Project = {
  id: "", title: "", link: "", fileType: "", owner: "", subOwners: [],
  status: "Not Started", startDate: "", endDate: "", notes: "", createdAt: "",
};
const EMPTY_TASK: Task = {
  id: "", title: "", notes: "", assignedTo: "", createdBy: "",
  status: "To Do", dueDate: "", dueTime: "", completedAt: "", createdAt: "",
};
const EMPTY_EVENT: Evt = {
  id: "", title: "", eventType: "Meeting", startDate: "", startTime: "",
  endDate: "", endTime: "", link: "", notes: "", createdBy: "",
};

/* ── Helpers ── */
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO() {
  return iso(new Date());
}
function fmtDate(s: string) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
/* Times are stored as 24-hour HH:MM but always read back as 3:00 PM. */
function fmtTime(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function fmtStamp(s: string) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}
function daysUntil(s: string): number | null {
  if (!s) return null;
  const a = new Date(todayISO() + "T00:00:00").getTime();
  const b = new Date(s + "T00:00:00").getTime();
  if (isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}
function relativeDay(s: string) {
  const n = daysUntil(s);
  if (n === null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${Math.abs(n)} days ago`;
  if (n <= 6) return `In ${n} days`;
  return fmtDate(s);
}
function timeAgo(stamp: string) {
  if (!stamp) return "";
  const diff = Date.now() - new Date(stamp).getTime();
  if (isNaN(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(stamp.slice(0, 10));
}
function taskOverdue(t: Task) {
  if (!t.dueDate || t.status === "Done") return false;
  const n = daysUntil(t.dueDate);
  return n !== null && n < 0;
}
function normalizeUrl(u: string) {
  const s = u.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}
function hostOf(u: string) {
  try {
    return new URL(normalizeUrl(u)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function match(query: string, haystack: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}
function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}
/* Within a date range, treating blank bounds as open-ended. */
function inRange(date: string, from: string, to: string) {
  if (from && (!date || date < from)) return false;
  if (to && (!date || date > to)) return false;
  return true;
}

/* Enter saves the form from any single-line field. A textarea keeps Enter for
   new lines, so notes still wrap — Ctrl/Cmd+Enter saves from there instead. */
function submitOnEnter(submit: () => void, busy?: boolean) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || busy) return;
    // Mid-composition Enter belongs to the IME, not to us.
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    const el = e.target as HTMLElement;
    if (el.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    submit();
  };
}

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  return data as T;
}

const CHEVRON_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378766f' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")";

/* ── Small UI pieces ── */
function Select({
  value, onChange, children, className, id,
}: {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className={cn(
        "flex h-9 w-full appearance-none rounded-xl border border-[#E4E2DC] bg-white px-3.5 py-1 pr-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#6E56CF]/45",
        className
      )}
      style={{ backgroundImage: CHEVRON_BG, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
    >
      {children}
    </select>
  );
}

function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A887F]">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-[#A3A199]">{hint}</p>}
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={cn(
        "flex w-full rounded-xl border border-[#E4E2DC] bg-white px-3.5 py-2.5 text-sm placeholder:text-[#A3A199] focus:outline-none focus:ring-2 focus:ring-[#6E56CF]/45 resize-none",
        className
      )}
    />
  );
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("px-4 py-3 text-left text-[11px] font-bold text-[#8A887F] uppercase tracking-[0.12em] whitespace-nowrap border-b border-[#EDEBE5]", className)}>{children}</th>
);
const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn("px-4 py-3.5 text-sm text-[#3B3A35] border-b border-[#F1EFE9] align-top", className)}>{children}</td>
);

function Pill({ text, color }: { text: string; color: string }) {
  if (!text) return <span className="text-[#A3A199]">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ background: color + "17", color }}
    >
      {text}
    </span>
  );
}

function Avatar({ name, size = 28, title }: { name: string; size?: number; title?: string }) {
  return (
    <span
      title={title || name}
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ background: ACCENT, height: size, width: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

function TaskCheck({
  done, onToggle, disabled, popping,
}: { done: boolean; onToggle: () => void; disabled?: boolean; popping?: boolean }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200 active:scale-90",
        popping && "check-pop",
        disabled && "opacity-50"
      )}
      style={done ? { background: OK, borderColor: OK } : { borderColor: "#CFCCC2" }}
    >
      <Check
        className={cn("h-3 w-3 text-white transition-opacity duration-150", done ? "opacity-100" : "opacity-0")}
        strokeWidth={3.5}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value, onChange, options, small,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; small?: boolean }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-[#E4E2DC] bg-white p-0.5">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full font-semibold transition-colors",
              small ? "px-3 h-7 text-[11px]" : "px-3.5 h-8 text-xs",
              active ? "text-white" : "text-[#5A5850] hover:bg-[#F3F2ED]"
            )}
            style={active ? { background: INK } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LinkChip({ url, label }: { url: string; label?: string }) {
  if (!url) return <span className="text-[#A3A199]">—</span>;
  const href = normalizeUrl(url);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline max-w-[260px]"
      style={{ color: ACCENT }}
      title={href}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label || hostOf(url) || "Open link"}</span>
    </a>
  );
}

function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm text-[#A3A199]">{text}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

function ConfirmDelete({
  open, onOpenChange, label, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; label: string; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" style={{ color: DANGER }} /> Delete
          </DialogTitle>
          <DialogDescription>
            Delete <span className="font-semibold text-[#3B3A35]">{label}</span>? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toast({ msg, error }: { msg: string; error?: boolean }) {
  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
      style={{ background: error ? DANGER : INK }}
    >
      {error ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />} {msg}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[40px] font-bold tracking-[-0.02em] leading-none" style={{ color: INK }}>{title}</h1>
        {subtitle && <p className="text-sm text-[#78766F] mt-2.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative glow-hover rounded-xl", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A3A199]" />
      <Input className="pl-8" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/* Multi-select for sub-owners. */
function PeoplePicker({
  people, selected, onChange, excludeEmail,
}: { people: Person[]; selected: string[]; onChange: (next: string[]) => void; excludeEmail?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = people.filter(p => p.email !== excludeEmail);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const nameOf = (email: string) => options.find(p => p.email === email)?.name || email;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-[#E4E2DC] bg-white px-3 py-1.5 text-left text-sm"
      >
        <span className="flex flex-wrap gap-1.5">
          {selected.length ? selected.map(email => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full bg-[#F3F2ED] px-2 py-0.5 text-xs font-semibold text-[#3B3A35]">
              {nameOf(email)}
            </span>
          )) : <span className="text-[#A3A199]">Nobody yet</span>}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#A3A199]" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#E4E2DC] bg-white p-1 shadow-lg">
          {options.length ? options.map(p => {
            const on = selected.includes(p.email);
            return (
              <button
                type="button"
                key={p.email}
                onClick={() => onChange(on ? selected.filter(e => e !== p.email) : [...selected, p.email])}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#F5F4F0]"
              >
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center rounded border"
                  style={on ? { background: ACCENT, borderColor: ACCENT } : { borderColor: "#CFCCC2" }}
                >
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="truncate text-[11px] text-[#A3A199]">{p.email}</span>
              </button>
            );
          }) : <p className="px-2 py-3 text-center text-xs text-[#A3A199]">No one else has been approved yet.</p>}
        </div>
      )}
    </div>
  );
}

/* ── Sign in / register ── */
function AuthScreen({
  domain, headConfigured, onSignedIn,
}: { domain: string; headConfigured: boolean; onSignedIn: (u: Me) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const url = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const user = await api<Me>(url, "POST", { email, name, password, remember });
      onSignedIn(user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: INK }}>
            <Mark light />
          </span>
          <div>
            <p className="text-lg font-bold leading-tight" style={{ color: INK }}>Project Tracker</p>
            <p className="text-xs text-[#78766F]">Recruitment Team</p>
          </div>
        </div>

        <Card className="p-6">
          <Segmented
            value={mode}
            onChange={v => { setMode(v); setErr(""); }}
            options={[{ value: "signin", label: "Sign in" }, { value: "register", label: "Create account" }]}
          />

          <div className="mt-5 flex flex-col gap-4" onKeyDown={submitOnEnter(submit, busy)}>
            {mode === "register" && (
              <Field label="Full name">
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rocky Ahmed" autoComplete="name" />
              </Field>
            )}
            <Field label="Work email" hint={mode === "register" ? `Only @${domain} addresses can register.` : undefined}>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={`you@${domain}`}
                autoComplete="username"
              />
            </Field>
            <Field label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3B3A35]">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-[#6E56CF]" />
              Keep me signed in on this device
            </label>

            {err && <p className="text-sm font-semibold" style={{ color: DANGER }}>{err}</p>}

            <Button className="h-10 w-full" disabled={busy} onClick={submit}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            {mode === "register" && (
              <p className="text-xs leading-relaxed text-[#78766F]">
                New accounts need to be authorised by the team head before they can be used.
                {!headConfigured && (
                  <span className="mt-1 block font-semibold" style={{ color: DANGER }}>
                    No head has been configured yet — set HEAD_EMAIL in .env.local first.
                  </span>
                )}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PendingScreen({ me, onRefresh, onSignOut }: { me: Me; onRefresh: () => void; onSignOut: () => void }) {
  const blocked = me.status === "blocked";
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-[440px] p-7 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full" style={{ background: blocked ? DANGER + "18" : ACCENT + "18" }}>
          {blocked ? <AlertTriangle className="h-5 w-5" style={{ color: DANGER }} /> : <ShieldCheck className="h-5 w-5" style={{ color: ACCENT }} />}
        </div>
        <h1 className="text-xl font-bold" style={{ color: INK }}>
          {blocked ? "Your access was revoked" : "Waiting for authorisation"}
        </h1>
        <p className="mt-2 text-sm text-[#78766F]">
          {blocked
            ? "The team head has removed your access to this workspace. Talk to them if this looks wrong."
            : "Your account was created. The team head has been notified and needs to authorise you before you can use the tracker."}
        </p>
        <p className="mt-3 text-xs text-[#A3A199]">Signed in as {me.email}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={onRefresh}><RotateCw className="h-3.5 w-3.5" /> Check again</Button>
          <Button variant="ghost" onClick={onSignOut}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Navigation ── */
function Mark({ light }: { light?: boolean }) {
  const base = light ? "#FFFFFF" : INK;
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <rect x="3" y="4" width="14" height="3.2" rx="1.6" fill={base} />
      <rect x="3" y="10.4" width="18" height="3.2" rx="1.6" fill={base} />
      <rect x="3" y="16.8" width="10" height="3.2" rx="1.6" fill={ACCENT} />
    </svg>
  );
}

const NAV: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "calendar", label: "Calendar" },
];

function BottomNav({
  view, setView, unread, me, onSignOut,
}: {
  view: View;
  setView: (v: View) => void;
  unread: number;
  me: Me;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={wrapRef} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="relative">
        {menuOpen && (
          <div className="absolute bottom-[calc(100%+14px)] right-0 w-60 rounded-2xl border border-[#E4E2DC] bg-white p-1.5 shadow-[0_24px_50px_-18px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar name={me.name || me.email} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: INK }}>{me.name || me.email}</p>
                <p className="truncate text-[11px] text-[#8A887F]">{me.email}</p>
              </div>
            </div>
            {me.role === "head" && (
              <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>Team head</p>
            )}
            <button
              onClick={() => { setMenuOpen(false); onSignOut(); }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[#3B3A35] hover:bg-[#F5F4F0]"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        )}

        <nav className="pill-nav flex items-center gap-1 rounded-full py-2 pl-2 pr-2 max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar" style={{ background: INK }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white" title="Project Tracker">
            <Mark />
          </span>

          {NAV.map(({ key, label }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => { setView(key); setMenuOpen(false); }}
                className={cn(
                  "shrink-0 rounded-full px-4 h-10 text-sm font-medium transition-colors",
                  active ? "bg-white font-semibold" : "text-white/75 hover:text-white hover:bg-white/10"
                )}
                style={active ? { color: INK } : undefined}
              >
                {label}
              </button>
            );
          })}

          <span className="mx-1 h-6 w-px shrink-0 bg-white/15" />

          <button
            onClick={() => { setView("notifications"); setMenuOpen(false); }}
            aria-label={`Notifications (${unread} unread)`}
            className={cn(
              "relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors",
              view === "notifications" ? "bg-white" : "text-white/75 hover:text-white hover:bg-white/10"
            )}
            style={view === "notifications" ? { color: INK } : undefined}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: DANGER, boxShadow: `0 0 0 2px ${INK}` }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          <button
            onClick={() => { setView("settings"); setMenuOpen(false); }}
            aria-label="Settings"
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors",
              view === "settings" ? "bg-white" : "text-white/75 hover:text-white hover:bg-white/10"
            )}
            style={view === "settings" ? { color: INK } : undefined}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => setMenuOpen(o => !o)}
            className="ml-0.5 flex h-10 shrink-0 items-center gap-2 rounded-full bg-white pl-1.5 pr-3.5 text-sm font-semibold"
            style={{ color: INK }}
          >
            <Avatar name={me.name || me.email} />
            <span className="max-w-[120px] truncate">{(me.name || me.email).split(" ")[0]}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </nav>
      </div>
    </div>
  );
}

/* ── Dialogs ── */
function TaskDialog({
  open, onOpenChange, initial, people, me, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Task;
  people: Person[];
  me: Me;
  onSave: (t: Task) => Promise<void>;
}) {
  const [form, setForm] = useState<Task>(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm({ ...initial, assignedTo: initial.assignedTo || me.email }); setErr(""); }
  }, [open, initial, me.email]);

  const set = (k: keyof Task, v: string) => setForm(f => ({ ...f, [k]: v }));
  const canReassign = !form.id || form.createdBy === me.email;

  async function submit() {
    if (!form.title.trim()) { setErr("Task title is required."); return; }
    if (form.dueTime && !form.dueDate) { setErr("Pick a due date for the time you set."); return; }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            A task with a due date shows on the calendar. Assigning it to someone notifies them straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 max-h-[65vh] overflow-y-auto grid grid-cols-2 gap-4" onKeyDown={submitOnEnter(submit, saving)}>
          <Field label="Title *" className="col-span-2">
            <Input autoFocus value={form.title} onChange={e => set("title", e.target.value)} placeholder="Send the offer letter" />
          </Field>
          <Field label="Assigned to" className="col-span-2" hint={canReassign ? undefined : "Only the person who assigned this task can reassign it."}>
            <Select value={form.assignedTo} onChange={e => set("assignedTo", e.target.value)}>
              {!people.some(p => p.email === me.email) && <option value={me.email}>{me.name || me.email} (me)</option>}
              {people.map(p => (
                <option key={p.email} value={p.email} disabled={!canReassign && p.email !== form.assignedTo}>
                  {p.name}{p.isMe ? " (me)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
          </Field>
          <Field label="Time (optional)">
            <Input type="time" value={form.dueTime} onChange={e => set("dueTime", e.target.value)} />
          </Field>
          <Field label="Notes (if any)" className="col-span-2">
            <Textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </Field>
          {err && <p className="col-span-2 text-sm font-semibold" style={{ color: DANGER }}>{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving ? "Saving…" : initial.id ? "Save changes" : "Add task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog({
  open, onOpenChange, initial, people, me, settings, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Project;
  people: Person[];
  me: Me;
  settings: Settings;
  onSave: (p: Project) => Promise<void>;
}) {
  const [form, setForm] = useState<Project>(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm({ ...initial, owner: initial.owner || me.email }); setErr(""); }
  }, [open, initial, me.email]);

  const set = (k: keyof Project, v: string | string[]) => setForm(f => ({ ...f, [k]: v }));
  const ownerName = people.find(p => p.email === form.owner)?.name || form.owner;

  async function submit() {
    if (!form.title.trim()) { setErr("Project title is required."); return; }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setErr("Ending date cannot be before the starting date."); return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, link: form.link ? normalizeUrl(form.link) : "" });
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit project" : "Add project"}</DialogTitle>
          <DialogDescription>Sub-owners are notified and can open and edit this project themselves.</DialogDescription>
        </DialogHeader>
        <div className="p-6 max-h-[65vh] overflow-y-auto grid grid-cols-2 gap-4" onKeyDown={submitOnEnter(submit, saving)}>
          <Field label="Title *" className="col-span-2">
            <Input autoFocus value={form.title} onChange={e => set("title", e.target.value)} placeholder="Q4 campus hiring drive" />
          </Field>
          <Field label="Link" className="col-span-2">
            <Input value={form.link} onChange={e => set("link", e.target.value)} placeholder="drive.google.com/…" />
          </Field>
          <Field label="File type">
            <Select value={form.fileType} onChange={e => set("fileType", e.target.value)}>
              <option value="">—</option>
              {settings.fileTypes.map(t => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => set("status", e.target.value)}>
              {PROJECT_STATUS.map(s => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Owner" hint="Set to whoever created the project.">
            <div className="flex h-9 items-center gap-2 rounded-xl border border-[#E4E2DC] bg-[#FAF9F6] px-3 text-sm text-[#3B3A35]">
              <Avatar name={ownerName} size={20} />
              <span className="truncate">{ownerName}</span>
            </div>
          </Field>
          <Field label="Sub-owners">
            <PeoplePicker
              people={people}
              selected={form.subOwners}
              onChange={next => set("subOwners", next)}
              excludeEmail={form.owner}
            />
          </Field>
          <Field label="Starting date">
            <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
          </Field>
          <Field label="Ending date">
            <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
          </Field>
          <Field label="Notes (if any)" className="col-span-2">
            <Textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </Field>
          {err && <p className="col-span-2 text-sm font-semibold" style={{ color: DANGER }}>{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving ? "Saving…" : initial.id ? "Save changes" : "Add project"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventDialog({
  open, onOpenChange, initial, settings, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Evt;
  settings: Settings;
  onSave: (e: Evt) => Promise<void>;
}) {
  const [form, setForm] = useState<Evt>(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm(initial); setErr(""); }
  }, [open, initial]);

  const set = (k: keyof Evt, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title.trim()) { setErr("Event title is required."); return; }
    if (!form.startDate) { setErr("Start date is required."); return; }
    if (form.endDate && form.endDate < form.startDate) { setErr("End date cannot be before the start date."); return; }
    setSaving(true);
    try {
      await onSave({ ...form, link: form.link ? normalizeUrl(form.link) : "" });
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            Leave the times blank and the reminder lands at {fmtTime(DEFAULT_EVENT_TIME)} on the day.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 max-h-[65vh] overflow-y-auto grid grid-cols-2 gap-4" onKeyDown={submitOnEnter(submit, saving)}>
          <Field label="Title *" className="col-span-2">
            <Input autoFocus value={form.title} onChange={e => set("title", e.target.value)} placeholder="Panel interview — batch 2" />
          </Field>
          <Field label="Type" className="col-span-2">
            <Select value={form.eventType} onChange={e => set("eventType", e.target.value)}>
              {settings.eventTypes.map(t => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Start date *">
            <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
          </Field>
          <Field label="Start time (if any)">
            <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
          </Field>
          <Field label="End time (if any)">
            <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
          </Field>
          <Field label="Link" className="col-span-2">
            <Input value={form.link} onChange={e => set("link", e.target.value)} placeholder="meet.google.com/…" />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </Field>
          {err && <p className="col-span-2 text-sm font-semibold" style={{ color: DANGER }}>{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving ? "Saving…" : initial.id ? "Save changes" : "Add event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Strike-through (300ms) then the row slides away (200ms, starting at 280ms). */
const ANIM_MS = 480;

/* ── Task row ── */
function TaskRow({
  task, me, nameOf, onToggle, onEdit, onDelete, showCompletion, anim,
}: {
  task: Task;
  me: Me;
  nameOf: (email: string) => string;
  onToggle: (t: Task) => void;
  onEdit?: (t: Task) => void;
  onDelete?: (t: Task) => void;
  showCompletion?: boolean;
  /* Set while the row is playing its tick-off (or un-tick) animation, before
     the change is committed and the row moves to its new group. */
  anim?: "done" | "undone";
}) {
  const done = task.status === "Done";
  const late = taskOverdue(task);
  const own = task.createdBy === task.assignedTo;
  const canDelete = task.createdBy === me.email;

  // During the animation the row shows where it is heading, not where it is.
  const struck = anim ? anim === "done" : done;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-[opacity,transform] duration-200 hover:bg-[#F7F6F3]",
        anim && "task-leaving delay-[280ms]"
      )}
    >
      <div className="pt-0.5">
        <TaskCheck done={struck} popping={anim === "done"} onToggle={() => onToggle(task)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium transition-colors duration-300", struck ? "text-[#A3A199]" : "text-[#26251F]")}>
          <span className={cn("strike-anim", struck && "is-struck")}>{task.title}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#8A887F]">
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 font-semibold" style={late ? { color: DANGER } : undefined}>
              <Clock className="h-3 w-3" />
              {relativeDay(task.dueDate)}{task.dueTime ? ` · ${fmtTime(task.dueTime)}` : ""}
            </span>
          )}
          {own
            ? <Pill text="Own task" color="#8A887F" />
            : task.assignedTo === me.email
              ? <Pill text={`Assigned by ${nameOf(task.createdBy)}`} color={ACCENT} />
              : <Pill text={`For ${nameOf(task.assignedTo)}`} color="#4B6BFB" />}
          {showCompletion && task.completedAt && (
            <span className="font-semibold" style={{ color: OK }}>Completed {fmtStamp(task.completedAt)}</span>
          )}
        </div>
        {task.notes && <p className="mt-1 text-xs text-[#A3A199] line-clamp-2">{task.notes}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onEdit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>}
        {onDelete && canDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#E11D48] hover:text-[#BE123C]" onClick={() => onDelete(task)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({
  projects, tasks, events, me, nameOf, onToggleTask, anim, go,
}: {
  projects: Project[];
  tasks: Task[];
  events: Evt[];
  me: Me;
  nameOf: (email: string) => string;
  onToggleTask: (t: Task) => void;
  anim: Record<string, "done" | "undone">;
  go: (v: View) => void;
}) {
  const open = tasks.filter(t => t.status !== "Done");
  const myTasks = open.filter(t => t.assignedTo === me.email && t.createdBy === me.email);
  const assignedToMe = open.filter(t => t.assignedTo === me.email && t.createdBy !== me.email);

  const byStatus = PROJECT_STATUS.map(s => ({ label: s, value: projects.filter(p => p.status === s).length }));
  const maxStatus = Math.max(1, ...byStatus.map(b => b.value));

  const upcoming = useMemo(() => {
    const t = todayISO();
    return [...events].filter(e => (e.endDate || e.startDate) >= t)
      .sort((a, b) => (a.startDate + (a.startTime || "")).localeCompare(b.startDate + (b.startTime || "")))
      .slice(0, 5);
  }, [events]);

  const soonest = [...myTasks, ...assignedToMe]
    .filter(t => t.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Everything at a glance." />

      {/* The matrix box: projects on one side, tasks on the other. */}
      <Card className="mb-5 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-6 border-b border-[#EDEBE5] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <button className="text-xs font-semibold" style={{ color: ACCENT }} onClick={() => go("projects")}>Open</button>
            </div>
            <p className="mt-3 text-[44px] font-bold leading-none tracking-tight" style={{ color: INK }}>{projects.length}</p>
            <p className="mt-1.5 text-xs text-[#8A887F]">total entries in your Projects tab</p>
            <div className="mt-5 space-y-2">
              {byStatus.map(b => (
                <div key={b.label} className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 text-xs text-[#5A5850]">{b.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDEBE5]">
                    <div className="h-full rounded-full transition-all" style={{ width: (b.value / maxStatus) * 100 + "%", background: STATUS_COLOR[b.label] }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold text-[#3B3A35]">{b.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <button className="text-xs font-semibold" style={{ color: ACCENT }} onClick={() => go("tasks")}>Open</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button onClick={() => go("tasks")} className="rounded-xl border border-[#EDEBE5] p-3.5 text-left transition-colors hover:bg-[#FAF9F6]">
                <p className="text-[32px] font-bold leading-none" style={{ color: INK }}>{myTasks.length}</p>
                <p className="mt-1.5 text-xs font-semibold text-[#5A5850]">My tasks</p>
                <p className="text-[11px] text-[#A3A199]">created by me</p>
              </button>
              <button onClick={() => go("tasks")} className="rounded-xl border border-[#EDEBE5] p-3.5 text-left transition-colors hover:bg-[#FAF9F6]">
                <p className="text-[32px] font-bold leading-none" style={{ color: ACCENT }}>{assignedToMe.length}</p>
                <p className="mt-1.5 text-xs font-semibold text-[#5A5850]">Tasks assigned</p>
                <p className="text-[11px] text-[#A3A199]">handed to me by someone</p>
              </button>
            </div>

            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A887F]">Upcoming events</p>
            {upcoming.length ? (
              <ul className="mt-2 space-y-2">
                {upcoming.map(e => (
                  <li key={e.id}>
                    <button onClick={() => go("calendar")} className="flex w-full items-start gap-2 rounded-lg p-1 -m-1 text-left hover:bg-[#F7F6F3]">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: EVENT_COLOR[e.eventType] || "#71717A" }} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[#26251F]">{e.title}</span>
                        <span className="block text-xs text-[#8A887F]">
                          {fmtDate(e.startDate)} · {fmtTime(e.startTime || DEFAULT_EVENT_TIME)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-[#A3A199]">Nothing scheduled ahead.</p>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Next on your list</CardTitle>
          <button className="text-xs font-semibold" style={{ color: ACCENT }} onClick={() => go("tasks")}>All tasks</button>
        </CardHeader>
        <CardContent className="pt-1">
          {soonest.length ? (
            <div className="-mx-2.5">
              {soonest.map(t => (
                <TaskRow key={t.id} task={t} me={me} nameOf={nameOf} onToggle={onToggleTask} anim={anim[t.id]} />
              ))}
            </div>
          ) : <p className="text-sm text-[#A3A199]">No dated tasks waiting on you.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tasks ── */
function Tasks({
  tasks, me, nameOf, onNew, onEdit, onDelete, onToggle, anim,
}: {
  tasks: Task[];
  me: Me;
  nameOf: (email: string) => string;
  onNew: () => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggle: (t: Task) => void;
  anim: Record<string, "done" | "undone">;
}) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<"mine" | "assigned" | "completed">("mine");
  const [direction, setDirection] = useState<"to-me" | "by-me">("to-me");
  const [completedScope, setCompletedScope] = useState<"all" | "own" | "assigned">("all");

  const searched = useMemo(
    () => tasks.filter(t =>
      match(q, [t.title, t.notes, nameOf(t.assignedTo), nameOf(t.createdBy)].join(" ")) &&
      inRange(t.dueDate, from, to)
    ),
    [tasks, q, from, to, nameOf]
  );

  const open = searched.filter(t => t.status !== "Done");
  const done = searched.filter(t => t.status === "Done");

  const visible = useMemo(() => {
    if (tab === "mine") return open.filter(t => t.assignedTo === me.email && t.createdBy === me.email);
    if (tab === "assigned") {
      return direction === "to-me"
        ? open.filter(t => t.assignedTo === me.email && t.createdBy !== me.email)
        : open.filter(t => t.createdBy === me.email && t.assignedTo !== me.email);
    }
    const mineDone = done.filter(t => t.assignedTo === me.email || t.createdBy === me.email);
    if (completedScope === "own") return mineDone.filter(t => t.createdBy === t.assignedTo);
    if (completedScope === "assigned") return mineDone.filter(t => t.createdBy !== t.assignedTo);
    return mineDone;
  }, [tab, direction, completedScope, open, done, me.email]);

  const groups = tab === "completed"
    ? [{ key: "done", label: "Completed", color: OK, items: visible }]
    : [
        { key: "overdue", label: "Overdue", color: DANGER, items: visible.filter(t => t.dueDate && t.dueDate < todayISO()) },
        { key: "today", label: "Today", color: ACCENT, items: visible.filter(t => t.dueDate === todayISO()) },
        { key: "upcoming", label: "Upcoming", color: "#8A887F", items: visible.filter(t => t.dueDate && t.dueDate > todayISO()) },
        { key: "someday", label: "No due date", color: "#A3A199", items: visible.filter(t => !t.dueDate) },
      ];

  const filtersOn = !!q || !!from || !!to;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Your to-do list and everything you have handed to other people."
        action={<Button onClick={onNew}><Plus className="h-4 w-4" /> New task</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput className="w-72" value={q} onChange={setQ} placeholder="Search tasks, people, notes…" />
        <Field label="From"><Input type="date" className="w-[165px]" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" className="w-[165px]" value={to} onChange={e => setTo(e.target.value)} /></Field>
        {filtersOn && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => { setQ(""); setFrom(""); setTo(""); }}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "mine", label: "My tasks" },
            { value: "assigned", label: "Assigned" },
            { value: "completed", label: "Completed" },
          ]}
        />
        {tab === "assigned" && (
          <Segmented
            small
            value={direction}
            onChange={setDirection}
            options={[{ value: "to-me", label: "To me" }, { value: "by-me", label: "By me" }]}
          />
        )}
        {tab === "completed" && (
          <Segmented
            small
            value={completedScope}
            onChange={setCompletedScope}
            options={[
              { value: "all", label: "All" },
              { value: "own", label: "Own tasks" },
              { value: "assigned", label: "Assigned tasks" },
            ]}
          />
        )}
        <span className="text-xs text-[#A3A199]">{plural(visible.length, "task")}</span>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            text={
              tab === "completed" ? "Nothing completed in this view yet."
                : tab === "assigned" ? (direction === "to-me" ? "Nobody has assigned you anything." : "You have not assigned anything to anyone.")
                  : "No open tasks of your own."
            }
            action={tab !== "completed" ? <Button onClick={onNew}><Plus className="h-4 w-4" /> New task</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.filter(g => g.items.length).map(g => (
            <Card key={g.key}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle style={{ color: g.color }}>{g.label}</CardTitle>
                <span className="text-xs font-semibold text-[#A3A199]">{g.items.length}</span>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="-mx-2.5">
                  {g.items.map(t => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      me={me}
                      nameOf={nameOf}
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      showCompletion={tab === "completed"}
                      anim={anim[t.id]}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Projects ── */
function Projects({
  projects, me, nameOf, onNew, onEdit, onDelete,
}: {
  projects: Project[];
  me: Me;
  nameOf: (email: string) => string;
  onNew: () => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(
    () => projects.filter(p =>
      match(q, [p.title, p.notes, p.link, p.fileType, nameOf(p.owner), ...p.subOwners.map(nameOf)].join(" ")) &&
      (!status || p.status === status)
    ),
    [projects, q, status, nameOf]
  );

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Projects you own, and the ones you were added to as a sub-owner."
        action={<Button onClick={onNew}><Plus className="h-4 w-4" /> Add project</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput className="w-72" value={q} onChange={setQ} placeholder="Search projects, people, links…" />
        <Select className="w-48" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All types</option>
          {PROJECT_STATUS.map(s => <option key={s}>{s}</option>)}
        </Select>
        {(q || status) && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => { setQ(""); setStatus(""); }}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <span className="text-xs text-[#A3A199]">{plural(filtered.length, "project")}</span>
      </div>

      {filtered.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Type</Th>
                  <Th>Owner</Th>
                  <Th>Sub-owners</Th>
                  <Th>Timeline</Th>
                  <Th>Status</Th>
                  <Th>Link</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isOwner = p.owner === me.email;
                  return (
                    <tr key={p.id} className="hover:bg-[#FAF9F6]">
                      <Td>
                        <p className="font-semibold text-[#26251F]">{p.title}</p>
                        {p.notes && <p className="mt-1 max-w-[300px] text-xs text-[#8A887F] line-clamp-2">{p.notes}</p>}
                      </Td>
                      <Td>{p.fileType || <span className="text-[#A3A199]">—</span>}</Td>
                      <Td>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Avatar name={nameOf(p.owner)} size={22} title={p.owner} />
                          {isOwner ? "You" : nameOf(p.owner)}
                        </span>
                      </Td>
                      <Td>
                        {p.subOwners.length ? (
                          <span className="flex flex-wrap gap-1">
                            {p.subOwners.map(s => (
                              <span key={s} className="rounded-full bg-[#F3F2ED] px-2 py-0.5 text-xs font-semibold text-[#3B3A35]" title={s}>
                                {s === me.email ? "You" : nameOf(s)}
                              </span>
                            ))}
                          </span>
                        ) : <span className="text-[#A3A199]">—</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-[#5A5850]">
                        {fmtDate(p.startDate)} → {fmtDate(p.endDate)}
                      </Td>
                      <Td><Pill text={p.status} color={STATUS_COLOR[p.status] || "#71717A"} /></Td>
                      <Td><LinkChip url={p.link} /></Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                          {isOwner && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#E11D48] hover:text-[#BE123C]" onClick={() => onDelete(p)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            text={projects.length ? "No projects match these filters." : "No projects yet."}
            action={<Button onClick={onNew}><Plus className="h-4 w-4" /> Add project</Button>}
          />
        </Card>
      )}
      <p className="mt-3 text-xs text-[#A3A199]">Sub-owners can edit a project; only the owner can delete it.</p>
    </div>
  );
}

/* ── Calendar ── */
type CalItem = {
  key: string; label: string; color: string; time?: string; kind: "event" | "task";
  evt?: Evt; task?: Task; meta: string;
};

function Calendar({
  events, tasks, me, nameOf, onNewOn, onEditEvent, onDeleteEvent, onEditTask, onToggleTask, anim,
}: {
  events: Evt[];
  tasks: Task[];
  me: Me;
  nameOf: (email: string) => string;
  onNewOn: (date: string) => void;
  onEditEvent: (e: Evt) => void;
  onDeleteEvent: (e: Evt) => void;
  onEditTask: (t: Task) => void;
  onToggleTask: (t: Task) => void;
  anim: Record<string, "done" | "undone">;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string>(todayISO());

  /* Only open tasks appear — a completed one drops off the calendar. */
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const push = (date: string, item: CalItem) => {
      if (!date) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(item);
    };

    events.forEach(e => {
      const color = EVENT_COLOR[e.eventType] || "#71717A";
      const start = e.startDate;
      const end = e.endDate && e.endDate > start ? e.endDate : start;
      const cur = new Date(start + "T00:00:00");
      const last = new Date(end + "T00:00:00");
      let guard = 0;
      while (cur <= last && guard < 366) {
        push(iso(cur), {
          key: e.id + iso(cur),
          label: e.title,
          color,
          time: e.startTime || DEFAULT_EVENT_TIME,
          kind: "event",
          evt: e,
          meta: e.eventType,
        });
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    });

    tasks.forEach(t => {
      if (t.status === "Done" || !t.dueDate) return;
      if (t.assignedTo !== me.email && t.createdBy !== me.email) return;
      const own = t.createdBy === t.assignedTo;
      push(t.dueDate, {
        key: "task" + t.id,
        label: t.title,
        color: taskOverdue(t) ? DANGER : ACCENT,
        time: t.dueTime,
        kind: "task",
        task: t,
        meta: own
          ? "Own task"
          : t.assignedTo === me.email
            ? `Assigned by ${nameOf(t.createdBy)}`
            : `Assigned to ${nameOf(t.assignedTo)}`,
      });
    });

    return map;
  }, [events, tasks, me.email, nameOf]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, month]);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const selectedItems = itemsByDate.get(selected) || [];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your events and the tasks still waiting on you. Completed tasks drop off."
        action={<Button onClick={() => onNewOn(selected)}><Plus className="h-4 w-4" /> New event</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="min-w-[150px] text-center text-base normal-case tracking-normal" style={{ color: INK }}>{MONTHS[month]} {year}</CardTitle>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="ml-1 h-8" onClick={() => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth()); setSelected(todayISO()); }}>Today</Button>
            </div>
            <span className="text-xs text-[#A3A199]">Click a day to add an event on it</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[#EDEBE5] bg-[#EDEBE5]">
              {WEEKDAYS.map(w => (
                <div key={w} className="bg-[#FAF9F6] py-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A887F]">{w}</div>
              ))}
              {cells.map(d => {
                const key = iso(d);
                const inMonth = d.getMonth() === month;
                const isToday = key === todayISO();
                const isSelected = key === selected;
                const items = itemsByDate.get(key) || [];
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => onNewOn(key)}
                    className={cn("min-h-[96px] bg-white p-1.5 text-left align-top transition-colors hover:bg-[#FAF9F6]", !inMonth && "bg-[#FBFAF7]")}
                    style={isSelected ? { boxShadow: `inset 0 0 0 2px ${ACCENT}` } : undefined}
                  >
                    <span
                      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold", inMonth ? "text-[#3B3A35]" : "text-[#C9C6BD]")}
                      style={isToday ? { background: INK, color: "#fff" } : undefined}
                    >
                      {d.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map(it => (
                        <div key={it.key} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ background: it.color + "17" }}>
                          {it.kind === "task"
                            ? <span className="h-2 w-2 shrink-0 rounded-[3px] border" style={{ borderColor: it.color }} />
                            : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.color }} />}
                          <span className="truncate text-[10px] font-medium" style={{ color: it.color }}>{it.label}</span>
                        </div>
                      ))}
                      {items.length > 3 && <p className="pl-1 text-[10px] text-[#A3A199]">+{items.length - 3} more</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base normal-case tracking-normal" style={{ color: INK }}>{fmtDate(selected)}</CardTitle>
            <Button variant="outline" size="sm" className="h-8" onClick={() => onNewOn(selected)}><Plus className="h-3.5 w-3.5" /> Event</Button>
          </CardHeader>
          <CardContent>
            {selectedItems.length ? (
              <ul className="space-y-2.5">
                {selectedItems.map(it => (
                  <li key={it.key} className="rounded-xl border border-[#EDEBE5] p-2.5">
                    <div className="flex items-start gap-2">
                      {it.kind === "task" && it.task
                        ? <div className="pt-0.5"><TaskCheck done={anim[it.task.id] === "done"} popping={anim[it.task.id] === "done"} onToggle={() => onToggleTask(it.task!)} /></div>
                        : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: it.color }} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#26251F]">{it.label}</p>
                        <p className="mt-0.5 text-xs text-[#8A887F]">
                          {it.meta}{it.time ? ` · ${fmtTime(it.time)}` : ""}
                        </p>
                        {it.evt?.link && <div className="mt-1"><LinkChip url={it.evt.link} /></div>}
                        {it.evt?.notes && <p className="mt-1 text-xs text-[#A3A199]">{it.evt.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {it.kind === "event" && it.evt && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditEvent(it.evt!)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-[#E11D48] hover:text-[#BE123C]" onClick={() => onDeleteEvent(it.evt!)}><Trash2 className="h-3 w-3" /></Button>
                          </>
                        )}
                        {it.kind === "task" && it.task && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditTask(it.task!)}><Pencil className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-[#A3A199]">Nothing on this day.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => onNewOn(selected)}>
                  <Plus className="h-3.5 w-3.5" /> Add an event
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Notifications ── */
const KIND_COLOR: Record<string, string> = {
  task_assigned: ACCENT,
  task_completed: OK,
  project_shared: "#4B6BFB",
  signup_request: "#C2740B",
  access_approved: OK,
  role_changed: ACCENT,
};

function Notifications({
  notifications, nameOf, onOpen, onMarkAll, go,
}: {
  notifications: Notif[];
  nameOf: (email: string) => string;
  onOpen: (n: Notif) => void;
  onMarkAll: () => void;
  go: (v: View) => void;
}) {
  const [tab, setTab] = useState<"ongoing" | "previous" | "all">("ongoing");

  /* Ongoing = still unread, or pointing at something that has not happened yet. */
  const isOngoing = (n: Notif) => {
    if (!n.readAt) return true;
    if (n.eventAt) return new Date(n.eventAt).getTime() >= new Date(todayISO() + "T00:00:00").getTime();
    return false;
  };

  const shown = notifications.filter(n => (tab === "all" ? true : tab === "ongoing" ? isOngoing(n) : !isOngoing(n)));
  const unread = notifications.filter(n => !n.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Assignments, project invitations and access requests."
        action={unread > 0 ? <Button variant="outline" onClick={onMarkAll}><Check className="h-4 w-4" /> Mark all read</Button> : undefined}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "ongoing", label: "Ongoing" },
            { value: "previous", label: "Previous" },
            { value: "all", label: "All" },
          ]}
        />
        <span className="text-xs text-[#A3A199]">{plural(shown.length, "notification")}{unread ? ` · ${unread} unread` : ""}</span>
      </div>

      {shown.length ? (
        <Card className="overflow-hidden">
          <ul>
            {shown.map(n => {
              const color = KIND_COLOR[n.kind] || "#8A887F";
              return (
                <li key={n.id} className="border-b border-[#F1EFE9] last:border-b-0">
                  <button
                    onClick={() => onOpen(n)}
                    className={cn("flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAF9F6]", !n.readAt && "bg-[#FBFAFF]")}
                  >
                    {n.actor ? <Avatar name={nameOf(n.actor)} size={34} title={n.actor} /> : (
                      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full" style={{ background: color + "18" }}>
                        <Bell className="h-4 w-4" style={{ color }} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#26251F]">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-[#5A5850]">{n.body}</p>}
                      <p className="mt-1 flex items-center gap-2 text-xs text-[#A3A199]">
                        <span>{timeAgo(n.createdAt)}</span>
                        {n.eventAt && <span>· due {fmtDate(n.eventAt.slice(0, 10))}</span>}
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: color + "17", color }}>
                          {n.kind.replace(/_/g, " ")}
                        </span>
                      </p>
                    </div>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            text={tab === "ongoing" ? "Nothing needs your attention." : "Nothing here."}
            action={<Button variant="outline" onClick={() => go("dashboard")}>Back to dashboard</Button>}
          />
        </Card>
      )}
    </div>
  );
}

/* ── Settings ── */
function ListEditor({
  title, items, onChange, readOnly,
}: { title: string; items: string[]; onChange: (next: string[]) => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) { setDraft(""); return; }
    onChange([...items, v]);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {items.length ? items.map(i => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F2ED] py-1 pl-3 pr-1 text-xs font-semibold text-[#3B3A35]">
              {i}
              {!readOnly && (
                <button onClick={() => onChange(items.filter(x => x !== i))} className="rounded-full p-0.5 hover:bg-[#E4E2DC]" aria-label={`Remove ${i}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )) : <span className="text-sm text-[#A3A199]">Nothing here yet.</span>}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add an option…" className="h-8" />
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={add}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsView({
  me, settings, setSettings, onSaveSettings, savingSettings, members, onMemberAction, onReload, onSignOut, counts,
}: {
  me: Me;
  settings: Settings;
  setSettings: (s: Settings) => void;
  onSaveSettings: () => void;
  savingSettings: boolean;
  members: Member[];
  onMemberAction: (m: Member, action: string) => void;
  onReload: () => void;
  onSignOut: () => void;
  counts: { projects: number; tasks: number; events: number };
}) {
  const isHead = me.role === "head";
  const pending = members.filter(m => m.status === "pending");
  const active = members.filter(m => m.status !== "pending");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={isHead ? "Authorise people and manage the shared lists." : "Your account and the shared lists."}
        action={isHead ? <Button disabled={savingSettings} onClick={onSaveSettings}>{savingSettings ? "Saving…" : "Save lists"}</Button> : undefined}
      />

      {isHead && (
        <Card className="mb-5 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-3.5 w-3.5" /> Waiting for authorisation</CardTitle>
            <span className="text-xs font-semibold text-[#A3A199]">{pending.length}</span>
          </CardHeader>
          <CardContent className="pt-1">
            {pending.length ? (
              <ul className="divide-y divide-[#F1EFE9]">
                {pending.map(m => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={m.name || m.email} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#26251F]">{m.name || "(no name)"}</p>
                      <p className="text-xs text-[#8A887F]">{m.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onMemberAction(m, "approve")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => onMemberAction(m, "block")}>Reject</Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-2 text-sm text-[#A3A199]">Nobody is waiting.</p>}
          </CardContent>
        </Card>
      )}

      {isHead && (
        <Card className="mb-5 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> People</CardTitle>
            <span className="text-xs font-semibold text-[#A3A199]">{active.length}</span>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-2">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
                </thead>
                <tbody>
                  {active.map(m => (
                    <tr key={m.id} className="hover:bg-[#FAF9F6]">
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={m.name || m.email} size={22} />
                          {m.name || "(no name)"}{m.email === me.email ? " (you)" : ""}
                        </span>
                      </Td>
                      <Td className="text-xs">{m.email}</Td>
                      <Td>{m.role === "head" ? <Pill text="Head" color={ACCENT} /> : <span className="text-[#8A887F]">Member</span>}</Td>
                      <Td>{m.status === "approved" ? <Pill text="Approved" color={OK} /> : <Pill text="Blocked" color={DANGER} />}</Td>
                      <Td className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {m.status === "blocked"
                            ? <Button size="sm" variant="outline" onClick={() => onMemberAction(m, "unblock")}>Restore</Button>
                            : m.email !== me.email && <Button size="sm" variant="outline" onClick={() => onMemberAction(m, "block")}>Revoke</Button>}
                          {m.role === "head"
                            ? m.email !== me.email && <Button size="sm" variant="ghost" onClick={() => onMemberAction(m, "demote")}>Make member</Button>
                            : <Button size="sm" variant="ghost" onClick={() => onMemberAction(m, "promote")}>Make head</Button>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ListEditor
          title="File types"
          items={settings.fileTypes}
          onChange={next => setSettings({ ...settings, fileTypes: next })}
          readOnly={!isHead}
        />
        <ListEditor
          title="Event types"
          items={settings.eventTypes}
          onChange={next => setSettings({ ...settings, eventTypes: next })}
          readOnly={!isHead}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Your account</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-[#5A5850]">
            <div className="flex items-center gap-2">
              <Avatar name={me.name || me.email} size={32} />
              <div className="min-w-0">
                <p className="truncate font-semibold" style={{ color: INK }}>{me.name || me.email}</p>
                <p className="truncate text-xs text-[#8A887F]">{me.email}</p>
              </div>
            </div>
            <p className="text-xs text-[#A3A199]">{me.role === "head" ? "You can authorise new people." : "Member access."}</p>
            <Button variant="outline" size="sm" onClick={onSignOut}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Your data</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-[#5A5850]">
            <p>{counts.projects} projects · {counts.tasks} tasks · {counts.events} events</p>
            <p className="text-xs text-[#A3A199]">Counts cover what you can see: your own records and anything shared with you.</p>
            <Button variant="outline" size="sm" onClick={onReload}><RotateCw className="h-3.5 w-3.5" /> Reload</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Access rules</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-xs text-[#5A5850]">
            <p>• Registration is limited to company email addresses.</p>
            <p>• A head must authorise every new account.</p>
            <p>• Only the person who assigned a task can delete it.</p>
            <p>• Only a project owner can delete the project; sub-owners can edit.</p>
            <p>• The calendar shows your own events and your open tasks.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── App ── */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [domain, setDomain] = useState("pathao.com");
  const [headConfigured, setHeadConfigured] = useState(true);

  const [view, setView] = useState<View>("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS as Settings);
  const [loadError, setLoadError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const [projectDlg, setProjectDlg] = useState<{ open: boolean; initial: Project }>({ open: false, initial: EMPTY_PROJECT });
  const [taskDlg, setTaskDlg] = useState<{ open: boolean; initial: Task }>({ open: false, initial: EMPTY_TASK });
  const [eventDlg, setEventDlg] = useState<{ open: boolean; initial: Evt }>({ open: false, initial: EMPTY_EVENT });
  const [del, setDel] = useState<{ open: boolean; label: string; run: () => Promise<void> }>({ open: false, label: "", run: async () => {} });
  const [anim, setAnim] = useState<Record<string, "done" | "undone">>({});

  const notify = useCallback((msg: string, error?: boolean) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const nameOf = useCallback(
    (email: string) => {
      if (!email) return "—";
      if (me && email === me.email) return me.name || me.email;
      return people.find(p => p.email === email)?.name || email;
    },
    [people, me]
  );

  const loadSession = useCallback(async () => {
    try {
      const data = await api<{ user: Me | null; domain: string; headConfigured: boolean }>("/api/auth/me", "GET");
      setMe(data.user);
      setDomain(data.domain);
      setHeadConfigured(data.headConfigured);
      return data.user;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  const loadData = useCallback(async (user: Me) => {
    if (user.status !== "approved") return;
    setLoadError("");
    try {
      const [p, t, e, n, u, s] = await Promise.all([
        api<Project[]>("/api/projects", "GET"),
        api<Task[]>("/api/tasks", "GET"),
        api<Evt[]>("/api/events", "GET"),
        api<Notif[]>("/api/notifications", "GET"),
        api<Person[]>("/api/users", "GET"),
        api<Settings>("/api/settings", "GET"),
      ]);
      setProjects(p);
      setTasks(t);
      setEvents(e);
      setNotifications(n);
      setPeople(u);
      setSettings(s);
      if (user.role === "head") {
        setMembers(await api<Member[]>("/api/admin/users", "GET"));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadSession().then(user => { if (user) loadData(user); });
  }, [loadSession, loadData]);

  async function signOut() {
    await api<{ ok: boolean }>("/api/auth/logout", "POST").catch(() => ({ ok: false }));
    setMe(null);
    setProjects([]); setTasks([]); setEvents([]); setNotifications([]); setPeople([]); setMembers([]);
    setView("dashboard");
  }

  /* ── Saves ── */
  function byTaskOrder(a: Task, b: Task) {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate === b.dueDate ? a.dueTime.localeCompare(b.dueTime) : a.dueDate.localeCompare(b.dueDate);
  }

  async function saveTask(t: Task) {
    if (t.id) {
      const row = await api<Task>(`/api/tasks/${t.id}`, "PUT", t);
      setTasks(prev => prev.map(x => (x.id === row.id ? row : x)).sort(byTaskOrder));
      notify("Task updated");
    } else {
      const row = await api<Task>("/api/tasks", "POST", t);
      setTasks(prev => [...prev, row].sort(byTaskOrder));
      notify(row.assignedTo === me?.email ? "Task added" : `Assigned to ${nameOf(row.assignedTo)}`);
    }
  }

  /* The row plays its strike-through first and only then moves to its new
     group, so the change reads as a movement rather than a jump. The request
     goes out immediately; the row moves when the animation ends whatever the
     network is doing, and snaps back only if the save actually failed. */
  async function toggleTask(t: Task) {
    if (anim[t.id]) return; // already mid-flight
    const toDone = t.status !== "Done";
    const next: Task = {
      ...t,
      status: toDone ? "Done" : "To Do",
      completedAt: toDone ? t.completedAt || new Date().toISOString() : "",
    };
    setAnim(a => ({ ...a, [t.id]: toDone ? "done" : "undone" }));

    const request = api<Task>(`/api/tasks/${t.id}`, "PUT", next).catch(e =>
      e instanceof Error ? e : new Error(String(e))
    );

    await new Promise(r => setTimeout(r, ANIM_MS));
    setTasks(prev => prev.map(x => (x.id === t.id ? next : x)).sort(byTaskOrder));
    setAnim(a => {
      const rest = { ...a };
      delete rest[t.id];
      return rest;
    });

    const result = await request;
    if (result instanceof Error) {
      setTasks(prev => prev.map(x => (x.id === t.id ? t : x)).sort(byTaskOrder));
      notify(result.message, true);
      return;
    }
    setTasks(prev => prev.map(x => (x.id === result.id ? result : x)).sort(byTaskOrder));
  }

  async function saveProject(p: Project) {
    if (p.id) {
      const row = await api<Project>(`/api/projects/${p.id}`, "PUT", p);
      setProjects(prev => prev.map(x => (x.id === row.id ? row : x)));
      notify("Project updated");
    } else {
      const row = await api<Project>("/api/projects", "POST", p);
      setProjects(prev => [row, ...prev]);
      notify(row.subOwners.length ? "Project added — sub-owners notified" : "Project added");
    }
  }

  async function saveEvent(e: Evt) {
    if (e.id) {
      const row = await api<Evt>(`/api/events/${e.id}`, "PUT", e);
      setEvents(prev => prev.map(x => (x.id === row.id ? row : x)));
      notify("Event updated");
    } else {
      const row = await api<Evt>("/api/events", "POST", e);
      setEvents(prev => [...prev, row]);
      notify("Event added");
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api<{ ok: boolean }>("/api/settings", "PUT", settings);
      notify("Lists saved");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSavingSettings(false);
    }
  }

  async function memberAction(m: Member, action: string) {
    try {
      await api<Member>("/api/admin/users", "PUT", { id: m.id, action });
      setMembers(await api<Member[]>("/api/admin/users", "GET"));
      setPeople(await api<Person[]>("/api/users", "GET"));
      notify(
        action === "approve" ? `${m.name || m.email} can now sign in`
          : action === "block" ? "Access revoked"
            : action === "unblock" ? "Access restored"
              : action === "promote" ? "Made a head"
                : "Set back to member"
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function openNotification(n: Notif) {
    if (!n.readAt) {
      try {
        setNotifications(await api<Notif[]>("/api/notifications", "PUT", { id: n.id }));
      } catch {
        // Marking read is not worth interrupting the user for.
      }
    }
    if (n.refType === "task") setView("tasks");
    else if (n.refType === "project") setView("projects");
    else if (n.refType === "user") setView("settings");
  }

  async function markAllRead() {
    try {
      setNotifications(await api<Notif[]>("/api/notifications", "PUT", { all: true }));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }

  function askDelete(label: string, run: () => Promise<void>) {
    setDel({ open: true, label, run });
  }

  async function runDelete() {
    try {
      await del.run();
      setDel(d => ({ ...d, open: false }));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }

  const unread = notifications.filter(n => !n.readAt).length;

  if (booting) {
    return <div className="flex h-screen items-center justify-center text-sm text-[#A3A199]">Loading…</div>;
  }

  if (!me) {
    return (
      <>
        <AuthScreen
          domain={domain}
          headConfigured={headConfigured}
          onSignedIn={async u => { setMe(u); await loadData(u); }}
        />
        {loadError && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: DANGER + "55", background: "#fff" }}>
            <p className="font-semibold" style={{ color: DANGER }}>{loadError}</p>
            <p className="mt-1 text-[#5A5850]">
              If this is the first run, the tables are missing — call <span className="font-mono">POST /api/setup</span> once.
            </p>
          </div>
        )}
      </>
    );
  }

  if (me.status !== "approved") {
    return <PendingScreen me={me} onRefresh={() => loadSession().then(u => u && loadData(u))} onSignOut={signOut} />;
  }

  return (
    <>
      <main className="mx-auto max-w-[1400px] px-6 pt-9 pb-32">
        {loadError && (
          <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: DANGER + "55", background: DANGER + "0d" }}>
            <p className="text-sm font-semibold" style={{ color: DANGER }}>Could not load data: {loadError}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => loadData(me)}><RotateCw className="h-3.5 w-3.5" /> Retry</Button>
              <Button variant="outline" size="sm" onClick={() => setView("settings")}><Database className="h-3.5 w-3.5" /> Settings</Button>
            </div>
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard
            projects={projects}
            tasks={tasks}
            events={events}
            me={me}
            nameOf={nameOf}
            onToggleTask={toggleTask}
            anim={anim}
            go={setView}
          />
        )}

        {view === "tasks" && (
          <Tasks
            tasks={tasks}
            me={me}
            nameOf={nameOf}
            onNew={() => setTaskDlg({ open: true, initial: { ...EMPTY_TASK, assignedTo: me.email } })}
            onEdit={t => setTaskDlg({ open: true, initial: t })}
            onToggle={toggleTask}
            anim={anim}
            onDelete={t => askDelete(t.title, async () => {
              await api<{ ok: boolean }>(`/api/tasks/${t.id}`, "DELETE");
              setTasks(prev => prev.filter(x => x.id !== t.id));
              notify("Task deleted");
            })}
          />
        )}

        {view === "projects" && (
          <Projects
            projects={projects}
            me={me}
            nameOf={nameOf}
            onNew={() => setProjectDlg({ open: true, initial: { ...EMPTY_PROJECT, owner: me.email } })}
            onEdit={p => setProjectDlg({ open: true, initial: p })}
            onDelete={p => askDelete(p.title, async () => {
              await api<{ ok: boolean }>(`/api/projects/${p.id}`, "DELETE");
              setProjects(prev => prev.filter(x => x.id !== p.id));
              notify("Project deleted");
            })}
          />
        )}

        {view === "calendar" && (
          <Calendar
            events={events}
            tasks={tasks}
            me={me}
            nameOf={nameOf}
            onNewOn={date => setEventDlg({ open: true, initial: { ...EMPTY_EVENT, startDate: date || todayISO() } })}
            onEditEvent={e => setEventDlg({ open: true, initial: e })}
            onDeleteEvent={e => askDelete(e.title, async () => {
              await api<{ ok: boolean }>(`/api/events/${e.id}`, "DELETE");
              setEvents(prev => prev.filter(x => x.id !== e.id));
              notify("Event deleted");
            })}
            onEditTask={t => setTaskDlg({ open: true, initial: t })}
            onToggleTask={toggleTask}
            anim={anim}
          />
        )}

        {view === "notifications" && (
          <Notifications
            notifications={notifications}
            nameOf={nameOf}
            onOpen={openNotification}
            onMarkAll={markAllRead}
            go={setView}
          />
        )}

        {view === "settings" && (
          <SettingsView
            me={me}
            settings={settings}
            setSettings={setSettings}
            onSaveSettings={saveSettings}
            savingSettings={savingSettings}
            members={members}
            onMemberAction={memberAction}
            onReload={() => loadData(me)}
            onSignOut={signOut}
            counts={{ projects: projects.length, tasks: tasks.length, events: events.length }}
          />
        )}
      </main>

      <BottomNav view={view} setView={setView} unread={unread} me={me} onSignOut={signOut} />

      <TaskDialog
        open={taskDlg.open}
        onOpenChange={o => setTaskDlg(d => ({ ...d, open: o }))}
        initial={taskDlg.initial}
        people={people}
        me={me}
        onSave={saveTask}
      />
      <ProjectDialog
        open={projectDlg.open}
        onOpenChange={o => setProjectDlg(d => ({ ...d, open: o }))}
        initial={projectDlg.initial}
        people={people}
        me={me}
        settings={settings}
        onSave={saveProject}
      />
      <EventDialog
        open={eventDlg.open}
        onOpenChange={o => setEventDlg(d => ({ ...d, open: o }))}
        initial={eventDlg.initial}
        settings={settings}
        onSave={saveEvent}
      />
      <ConfirmDelete
        open={del.open}
        onOpenChange={o => setDel(d => ({ ...d, open: o }))}
        label={del.label}
        onConfirm={runDelete}
      />

      {toast && <Toast msg={toast.msg} error={toast.error} />}
    </>
  );
}
