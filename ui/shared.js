export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const num = value => value === null || value === undefined ? "—"
  : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const pct = value => value === null || value === undefined ? "—" : (value * 100).toFixed(1) + "%";
export const empty = (text, action = "") => `<div class="empty"><p>${esc(text)}</p>${action}</div>`;
export const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
// An evidence source is a link when it is a web page; a product-fact may cite a repository path,
// which is shown as text because it is not an address the desk can open.
export const sourceLink = (url, label) => /^https?:\/\//i.test(url) ? link(url, label)
  : `<span class="meta">${esc(label)}: <code>${esc(url)}</code></span>`;
export const refLinks = (ids, refs) => (ids || []).map(id => refs.find(r => r.id === id)).filter(Boolean).map(r => link(r.url, r.title)).join(" · ");
export const projectLabel = (id, workspace) => `<span class="meta project-label">${esc(workspace.projects.find(p => p.id === id)?.name || id)}</span>`;

export function restoreFocus(key) {
  if (!key) return;
  document.querySelector(key)?.focus({ preventScroll: true });
}
// A control the page disabled on purpose (the standing choice in "Change to"). Redrawing the busy
// state must not switch it back on.
export const keepsDisabled = el => Boolean(el.hasAttribute?.("data-keep-disabled") || el.getAttribute?.("aria-disabled") === "true");
