import { esc } from "./shared.js";

// Small things the progress views share: what the owner has left open or half typed (the page
// redraws after every save, and neither may be lost by it), dates counted in days, and the chips
// and jump buttons that tie one record to another.
const opened = new Map(),
  drafts = new Map();

// A section of the Decide & plan page (key "section:...") is the owner's own layout choice, so it is
// kept in this browser between visits. Storage may be blocked or missing: then it lives in memory only.
const SECTION = "section:", stored = (key) => "desk.section." + key.slice(SECTION.length);
const readSection = (key) => {
  try {
    const v = globalThis.localStorage?.getItem(stored(key));
    return v === "1" ? true : v === "0" ? false : null;
  } catch { return null; }
};
export const setOpen = (key, value) => {
  opened.set(key, value);
  if (key.startsWith(SECTION)) { try { globalThis.localStorage?.setItem(stored(key), value ? "1" : "0"); } catch { /* blocked: memory only */ } }
};
export const isOpen = (key, fallback = false) => {
  if (opened.has(key)) return opened.get(key);
  return (key.startsWith(SECTION) ? readSection(key) : null) ?? fallback;
};
// For a <details>: its key, so a toggle can be remembered, and `open` when it was left open.
export const openAttr = (key, fallback = false) => `data-key="${esc(key)}"${isOpen(key, fallback) ? " open" : ""}`;

export const draftValue = (key) => drafts.get(key) ?? "";
export const setDraft = (key, value) => { if (value === "") drafts.delete(key); else drafts.set(key, value); };
export const clearDrafts = (...keys) => { for (const key of keys) drafts.delete(key); };
// A field whose text survives a redraw: it carries its key and starts from what was typed.
export const draftAttr = (key) => `data-draft="${esc(key)}"`;
// A <select> option marked chosen when it is what the owner picked (or, with no pick, the fallback).
export const selectedIf = (value, current) => (String(value) === String(current) ? " selected" : "");
// A different workspace is a different set of records: nothing half typed or left open carries over.
export function resetHubState() { opened.clear(); drafts.clear(); }
// Whether a record the desk was asked to show can actually be seen: not in a hidden tab or view.
export const isShown = (el) => Boolean(el) && el.checkVisibility?.() !== false;

export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const hoursText = (h) => `${Math.round(h * 100) / 100} h`;
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

const GLYPH = { open: "○", decided: "✓", deferred: "…", superseded: "↷", todo: "○", doing: "◐", done: "✓", blocked: "✕", dropped: "↷", passed: "✓", failed: "✕", waived: "↷", picked: "✓", candidate: "○", selected: "★", rejected: "✕", retired: "↷", planned: "○", running: "▶", paused: "‖", complete: "✓" };
// A status is a word and a shape as well as a colour.
export const statusChip = (status) =>
  `<span class="pill status-chip ${esc(status)}"><span aria-hidden="true">${GLYPH[status] ?? "•"}</span> ${esc(status)}</span>`;

// A button that takes the reader to another record on the desk, whichever tab it is on.
export const gotoButton = (kind, id, label, extra = "") =>
  `<button type="button" class="link-button${extra ? " " + extra : ""}" data-goto="${esc(kind)}:${esc(id)}">${esc(label)}</button>`;

export const initiativeName = (workspace, id) => workspace.initiatives.find((i) => i.id === id)?.name ?? id;
// Whether text is waiting half typed in this tab. A chosen option in a select is a preference, not work to lose.
export const hasDrafts = () => [...drafts.keys()].some((k) => !/:(owner|initiativeId|kind|projectId)$/.test(k));

// A long text (the project's objective, its promise) is clamped to a few lines by the stylesheet, and
// this is the toggle that shows all of it: a <details> whose open state the stylesheet reads to lift the
// clamp, so the text is in the page once and the summary says what it does. Short text needs no toggle.
export function clampMore(text, label, { at = 150 } = {}) {
  if (!text || String(text).length <= at) return "";
  return `<details class="clamp-more"><summary><span class="clamp-open">${esc(label)}</span><span class="clamp-shut">Show less</span></summary></details>`;
}

// A row shows its title in two lines at most (the stylesheet clamps it); a title longer than that is given
// whole as the first thing under the row's Details, so nothing is cut off for good.
export const TITLE_LINE = 100;
export const fullTitle = (text) => (String(text ?? "").length > TITLE_LINE ? `<p class="caption full-title"><span class="label">Full title</span>${esc(text)}</p>` : "");

// A row that stays one line: `head` is what it says at a glance, `detail` what waits behind its Details
// toggle. The controls are never put in here; they sit beside it so they stay one click away. With no
// detail there is no toggle. The toggle is a <details>, so the browser keeps it keyboard reachable and
// says whether it is open; `key` keeps it open across the redraw that follows a save.
export function foldMain({ key, head, detail = "", label = "Details" }) {
  if (!detail) return `<div class="row-line">${head}</div>`;
  return `<details class="row-fold" ${openAttr(key)}><summary class="row-line">${head}<span class="row-toggle">${esc(label)}</span></summary><div class="row-detail">${detail}</div></details>`;
}

