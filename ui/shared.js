export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const num = value => value === null || value === undefined ? "—"
  : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const pct = value => value === null || value === undefined ? "—" : (value * 100).toFixed(1) + "%";
export const empty = (text, action = "") => `<div class="empty"><p>${esc(text)}</p>${action}</div>`;
export const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
export const refLinks = (ids, refs) => (ids || []).map(id => refs.find(r => r.id === id)).filter(Boolean).map(r => link(r.url, r.title)).join(" · ");
export const projectLabel = (id, workspace) => `<span class="meta project-label">${esc(workspace.projects.find(p => p.id === id)?.name || id)}</span>`;

export function restoreFocus(key) {
  if (!key) return;
  document.querySelector(key)?.focus({ preventScroll: true });
}
