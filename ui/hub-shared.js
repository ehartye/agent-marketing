import { esc } from "./shared.js";

// Small things the progress views share: what the owner has left open or half typed (the page
// redraws after every save, and neither may be lost by it), dates counted in days, and the chips
// and jump buttons that tie one record to another.
const opened = new Map(),
  drafts = new Map();

export const setOpen = (key, value) => { opened.set(key, value); };
export const isOpen = (key, fallback = false) => (opened.has(key) ? opened.get(key) : fallback);
// For a <details>: its key, so a toggle can be remembered, and `open` when it was left open.
export const openAttr = (key, fallback = false) => `data-key="${esc(key)}"${isOpen(key, fallback) ? " open" : ""}`;

export const draftValue = (key) => drafts.get(key) ?? "";
export const setDraft = (key, value) => { if (value === "") drafts.delete(key); else drafts.set(key, value); };
export const clearDrafts = (...keys) => { for (const key of keys) drafts.delete(key); };
// A field whose text survives a redraw: it carries its key and starts from what was typed.
export const draftAttr = (key) => `data-draft="${esc(key)}"`;

export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const dayNumber = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const daysFrom = (today, date) => dayNumber(date) - dayNumber(today);
// The local calendar date of a timestamp, as the owner lives it.
export const localDay = (iso) => {
  const t = new Date(iso), two = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}`;
};

// Overdue and due-soon are said in words as well as colour.
export function dueBadge(daysLeft, date) {
  if (daysLeft === null || daysLeft === undefined) return '<span class="pill due none">No date</span>';
  const when = date ? ` · ${esc(date)}` : "";
  if (daysLeft < 0) return `<span class="pill due overdue"><span aria-hidden="true">!</span> Overdue ${plural(-daysLeft, "day")}${when}</span>`;
  if (daysLeft === 0) return `<span class="pill due soon">Due today${when}</span>`;
  return `<span class="pill due${daysLeft <= 3 ? " soon" : ""}">Due in ${plural(daysLeft, "day")}${when}</span>`;
}

const GLYPH = { open: "○", decided: "✓", deferred: "…", superseded: "↷", todo: "○", doing: "◐", done: "✓", blocked: "✕", dropped: "↷", passed: "✓", failed: "✕", waived: "↷", picked: "✓", candidate: "○", selected: "★", rejected: "✕", retired: "↷" };
// A status is a word and a shape as well as a colour.
export const statusChip = (status) =>
  `<span class="pill status-chip ${esc(status)}"><span aria-hidden="true">${GLYPH[status] ?? "•"}</span> ${esc(status)}</span>`;

// A button that takes the reader to another record on the desk, whichever tab it is on.
export const gotoButton = (kind, id, label, extra = "") =>
  `<button type="button" class="link-button${extra ? " " + extra : ""}" data-goto="${esc(kind)}:${esc(id)}">${esc(label)}</button>`;

export const initiativeName = (workspace, id) => workspace.initiatives.find((i) => i.id === id)?.name ?? id;
