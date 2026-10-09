import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Run the real theme.js against a minimal browser stand-in.
function page({ systemLight = false, saved, storageBroken = false } = {}) {
  const store = new Map(saved ? [["agent-marketing-theme", saved]] : []);
  const listeners = {};
  const root = { dataset: {} };
  const media = {
    matches: systemLight,
    addEventListener: (type, fn) => (listeners["media:" + type] = fn),
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (type, fn) => (listeners["window:" + type] = fn),
  };
  const localStorage = storageBroken
    ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } }
    : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  window.window = window;
  vm.runInNewContext(readFileSync("ui/theme.js", "utf8"), { window, document: { documentElement: root }, localStorage });
  return { window, root, media, store, listeners };
}

test("Auto follows the system, and keeps following it when the system changes", () => {
  const dark = page();
  assert.equal(dark.root.dataset.theme, "dark");
  assert.equal(dark.window.deskTheme.get(), "auto");
  const light = page({ systemLight: true });
  assert.equal(light.root.dataset.theme, "light");
  light.media.matches = false;
  light.listeners["media:change"]();
  assert.equal(light.root.dataset.theme, "dark");
});

test("a saved choice beats the system, and Match system clears it", () => {
  const p = page({ systemLight: true, saved: "dark" });
  assert.equal(p.root.dataset.theme, "dark");
  p.window.deskTheme.set("light");
  assert.equal(p.root.dataset.theme, "light");
  assert.equal(p.store.get("agent-marketing-theme"), "light");
  p.window.deskTheme.set("auto");
  assert.equal(p.store.has("agent-marketing-theme"), false);
  assert.equal(p.root.dataset.theme, "light");
});

test("an unknown saved value is treated as Auto", () => {
  const p = page({ saved: "neon" });
  assert.equal(p.window.deskTheme.get(), "auto");
  assert.equal(p.root.dataset.theme, "dark");
});

test("blocked storage still switches the page and never throws", () => {
  const p = page({ storageBroken: true, systemLight: true });
  assert.equal(p.root.dataset.theme, "light");
  p.window.deskTheme.set("dark");
  assert.equal(p.root.dataset.theme, "dark");
  p.window.deskTheme.set("auto");
  assert.equal(p.root.dataset.theme, "light");
});

test("another tab changing the setting updates this one", () => {
  const p = page();
  p.store.set("agent-marketing-theme", "light");
  p.listeners["window:storage"]({ key: "agent-marketing-theme" });
  assert.equal(p.root.dataset.theme, "light");
  p.store.delete("agent-marketing-theme");
  p.listeners["window:storage"]({ key: "unrelated" });
  assert.equal(p.root.dataset.theme, "light", "unrelated keys are ignored");
});
