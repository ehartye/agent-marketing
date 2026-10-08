import { esc } from "./shared.js";

// A small, strict Markdown renderer for saved reports. Every character of input
// is escaped before any markup is added; only http(s) links become anchors.
const INLINE = /`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(https?:\/\/[^\s<>)\]|]+)/g;
const anchor = (url, label) =>
  `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

export function inline(text) {
  let out = "", last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out += `<code>${esc(m[1])}</code>`;
    else if (m[2] !== undefined) out += esc(m[2].includes("|") ? m[2].split("|").pop() : m[2]);
    else if (m[3] !== undefined) out += anchor(m[4], inline(m[3]));
    else if (m[5] !== undefined) out += `<strong>${inline(m[5])}</strong>`;
    else if (m[6] !== undefined) out += `<em>${inline(m[6])}</em>`;
    else out += anchor(m[7], esc(m[7]));
  }
  return out + esc(text.slice(last));
}

const cells = (line) =>
  line.trim().replace(/^\||\|$/g, "")
    // Keep the pipe inside [[target|label]] from splitting a cell.
    .replace(/\[\[[^\]]*\]\]/g, (w) => w.replaceAll("|", "\u0000"))
    .split("|")
    .map((c) => c.replaceAll("\u0000", "|").trim());

const isRule = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
const isTableRow = (line) => line.includes("|") && line.trim() !== "";

export function renderMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) return "";
  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "") // leading YAML frontmatter
    .split("\n");
  const html = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      html.push(`<pre><code>${esc(body.join("\n") + "\n")}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length + 2;
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html.push("<hr>"); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line), rows = [];
      for (i += 2; i < lines.length && isTableRow(lines[i]); i++) rows.push(cells(lines[i]));
      html.push(
        `<div class="table-scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, ""));
      html.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }
    const list = /^\s*([-*]|\d+\.)\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]), items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]); i++)
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*]|\d+\.)\s+)/.test(lines[i]) && !(isTableRow(lines[i]) && i + 1 < lines.length && isRule(lines[i + 1])); i++)
      para.push(lines[i].trim());
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return html.join("");
}
