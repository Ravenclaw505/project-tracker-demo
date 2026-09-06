/* Shared option lists and design tokens for the Project Tracker.
   The palette is deliberately unrelated to the recruitment tracker's red-on-gray
   theme: near-black surfaces, a warm paper canvas and a violet accent. */

export const INK = "#141414";
export const INK_SOFT = "#2A2A2E";
export const ACCENT = "#6E56CF";
export const ACCENT_SOFT = "#EFEBFB";
export const CANVAS = "#F1F0EC";
export const LINE = "#E4E2DC";
export const DANGER = "#E11D48";
export const OK = "#0E9F6E";

export const PROJECT_STATUS = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"] as const;

export const FILE_TYPES = [
  "Google Sheet",
  "Google Doc",
  "Google Slide",
  "Google Form",
  "Drive Folder",
  "PDF",
  "Excel",
  "Word",
  "PowerPoint",
  "Other Link",
];

export const EVENT_TYPES = ["Meeting", "Milestone", "Deadline", "Review", "Interview Drive", "Reminder"];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* An event with no start time is announced at the start of the working day. */
export const DEFAULT_EVENT_TIME = "09:30";

export const STATUS_COLOR: Record<string, string> = {
  "Not Started": "#71717A",
  "In Progress": ACCENT,
  "On Hold": "#C2740B",
  "Completed": OK,
  "Cancelled": "#A1A1AA",
};

export const EVENT_COLOR: Record<string, string> = {
  Meeting: "#4B6BFB",
  Milestone: ACCENT,
  Deadline: DANGER,
  Review: "#0891B2",
  "Interview Drive": OK,
  Reminder: "#C2740B",
};

/* Settings keys stored in the app_settings table (JSON string values). */
export type SettingsKey = "fileTypes" | "eventTypes";
export const SETTINGS_DEFAULTS: Record<SettingsKey, string[]> = {
  fileTypes: FILE_TYPES,
  eventTypes: EVENT_TYPES,
};
