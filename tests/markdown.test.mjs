import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../ui/markdown.js";

test("headings, paragraphs, emphasis, code and lists render", () => {
  const html = renderMarkdown("# Title\n\nSome **bold** and *soft* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n");
  assert.match(html, /<h3>Title<\/h3>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>soft<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test("pipe tables render with a header and keep piped wikilinks in one cell", () => {
  const html = renderMarkdown("| Game | Route |\n|---|---|\n| [[wiki/a.md|Alpha]] | Steam |\n| Beta | Web |\n");
  assert.match(html, /<table>/);
  assert.match(html, /<th>Game<\/th><th>Route<\/th>/);
  assert.match(html, /<td>Alpha<\/td><td>Steam<\/td>/);
  assert.match(html, /<td>Beta<\/td><td>Web<\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});

test("only http(s) links become anchors, with safe attributes", () => {
  const html = renderMarkdown("[ok](https://example.com/a?b=1&c=2) [bad](javascript:alert(1)) https://example.org/x");
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /\[bad\]\(javascript:alert\(1\)\)/);
  assert.match(html, /<a href="https:\/\/example.org\/x"/);
});

test("raw HTML, attribute injection and script text are escaped everywhere", () => {
  const html = renderMarkdown(
    '<script>alert(1)</script>\n\n| a |\n|---|\n| <img src=x onerror=alert(1)> |\n\n[x" onmouseover="alert(1)](https://e.com)\n\n```\n<b>raw</b>\n```\n',
  );
  assert.doesNotMatch(html, /<script|<img|<b>/);
  assert.doesNotMatch(html, /onmouseover="alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<pre><code>&lt;b&gt;raw&lt;\/b&gt;\n<\/code><\/pre>/);
});

test("blockquotes, rules and wikilinks without a label render as plain text", () => {
  const html = renderMarkdown("> quoted\n\n---\n\nSee [[wiki/authored/x.md]] now.\n");
  assert.match(html, /<blockquote>quoted<\/blockquote>/);
  assert.match(html, /<hr>/);
  assert.match(html, /See wiki\/authored\/x.md now\./);
});

test("empty or non-string input renders nothing", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown(undefined), "");
});

test("a leading YAML frontmatter block is not shown", () => {
  const html = renderMarkdown("---\ntype: authored\nstatus: draft\n---\n# Real title\n\nBody\n");
  assert.doesNotMatch(html, /type: authored|status: draft/);
  assert.match(html, /<h3>Real title<\/h3>/);
  // A horizontal rule in the body is still a rule.
  assert.match(renderMarkdown("Intro\n\n---\n\nAfter"), /<hr>/);
});
