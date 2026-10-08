import { readWorkspace, mutateWorkspace } from "./store.mjs";
import { sentimentSuggestion } from "./analysis.mjs";
import { createHash } from "node:crypto";
function recordId(value) {
  return value.length <= 160
    ? value
    : value.slice(0, 120) +
        ":" +
        createHash("sha256").update(value).digest("hex").slice(0, 24);
}
async function getJson(url, options, headers = {}) {
  let response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new Error("Network unavailable or request timed out (offline)");
  }
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status} at ${new URL(url).hostname}${new URL(url).pathname}; check source access, permissions or rate limits`,
    );
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Source response exceeds 2 MB");
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function plain(html) {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, n) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n],
    );
}
export async function collectSource(s, options = {}) {
  const now = options.now || new Date().toISOString(),
    day = now.slice(0, 10),
    observations = [],
    reactions = [],
    errors = [];
  const add = (metric, value, url, extra = {}) =>
    observations.push({
      id: recordId(`${s.id}:${metric}:${extra.start || day}`),
      projectId: s.projectId,
      initiativeId: s.initiativeId,
      channel: s.channel,
      metric,
      value,
      start: day,
      end: day,
      kind: "snapshot",
      series: `${s.id}:${metric}`,
      definition: metric,
      url,
      collectedAt: now,
      ...extra,
    });
  if (s.adapter === "github") {
    const api = `https://api.github.com/repos/${s.target}`,
      url = `https://github.com/${s.target}`,
      headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "agent-marketing/0.7.0",
      };
    if (process.env.GITHUB_TOKEN)
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const repo = await getJson(api, options, headers);
    add("stars", repo.stargazers_count, url);
    if (s.traffic)
      for (const endpoint of ["views", "clones"])
        try {
          const data = await getJson(
            `${api}/traffic/${endpoint}?per=day`,
            options,
            headers,
          );
          for (const entry of data[endpoint]) {
            const date = entry.timestamp.slice(0, 10);
            add(endpoint, entry.count, url + "/graphs/traffic", {
              start: date,
              end: date,
              kind: "period",
              series: undefined,
              definition: `GitHub daily ${endpoint}`,
            });
            // Daily unique visitors cannot be summed into unique people across days.
            if (endpoint === "views")
              add("uniqueVisitors", entry.uniques, url + "/graphs/traffic", {
                start: date,
                end: date,
                kind: "period",
                series: undefined,
                definition: `GitHub unique visitors on ${date}`,
              });
          }
        } catch (e) {
          errors.push(e.message);
        }
  } else if (s.adapter === "hn") {
    const root = await getJson(
      `https://hacker-news.firebaseio.com/v0/item/${s.target}.json`,
      options,
    );
    if (!root || root.deleted || root.dead)
      throw new Error("HN item unavailable, deleted or dead");
    const url = `https://news.ycombinator.com/item?id=${s.target}`;
    add("votes", root.score ?? 0, url);
    add("comments", root.descendants ?? 0, url);
    const queue = [...(root.kids || [])],
      seen = new Set();
    while (queue.length && seen.size < 100) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const r = await getJson(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          options,
        );
        if (!r) continue;
        queue.push(...(r.kids || []));
        if (r.deleted || r.dead || !r.text) continue;
        const text = plain(r.text),
          suggestion = sentimentSuggestion(text);
        reactions.push({
          id: recordId(`${s.id}:comment:${id}`),
          projectId: s.projectId,
          initiativeId: s.initiativeId,
          channel: s.channel,
          text,
          url: `https://news.ycombinator.com/item?id=${id}`,
          collectedAt: now,
          sentiment: suggestion.label,
          reviewed: false,
          theme: "unclassified",
        });
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (queue.length)
      errors.push("Comment sample capped at 100 items; thread is incomplete");
  } else throw new Error("Unsupported monitor adapter");
  return { observations, reactions, errors };
}
export async function monitor(file, options = {}) {
  const original = readWorkspace(file),
    results = [];
  for (const source of original.sources.filter(
    (s) => !options.sourceId || s.id === options.sourceId,
  )) {
    try {
      const data = await collectSource(source, options);
      results.push({ source, data });
    } catch (e) {
      results.push({
        source,
        data: { observations: [], reactions: [], errors: [e.message] },
      });
    }
  }
  if (options.sourceId && !results.length)
    throw new Error("Monitoring source does not exist");
  if (!results.length)
    return {
      sources: [],
      hint: "Register a GitHub or HN source with put sources, or import platform exports.",
    };
  const updated = mutateWorkspace(file, (w) => {
    for (const { source, data } of results) {
      const current = w.sources.find((s) => s.id === source.id);
      if (
        !current ||
        [
          "target",
          "adapter",
          "projectId",
          "initiativeId",
          "channel",
          "traffic",
        ].some((k) => current[k] !== source[k])
      )
        throw new Error("Monitoring source changed during collection; rerun");
      for (const key of ["observations", "reactions"]) {
        const map = new Map(w[key].map((r) => [r.id, r]));
        for (const row of data[key]) {
          const old = map.get(row.id);
          map.set(
            row.id,
            key === "reactions" && old && old.text === row.text
              ? {
                  ...row,
                  sentiment: old.sentiment,
                  reviewed: old.reviewed,
                  theme: old.theme,
                }
              : row,
          );
        }
        w[key] = [...map.values()];
      }
      current.lastCheckedAt = options.now || new Date().toISOString();
      current.lastError = data.errors.join("; ");
    }
  });
  return {
    revision: updated.revision,
    sources: results.map(({ source, data }) => ({
      id: source.id,
      observations: data.observations.length,
      reactions: data.reactions.length,
      errors: data.errors,
    })),
  };
}
