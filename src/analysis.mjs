import { stageAction, viabilityGuide, channelGuide } from "./stages.mjs";
export function wilson(successes, trials) {
  if (
    !Number.isSafeInteger(trials) ||
    !Number.isSafeInteger(successes) ||
    successes < 0 ||
    trials < successes
  )
    throw new Error("Expected 0 <= integer successes <= integer trials");
  if (!trials) return null;
  const z = 1.959963984540054,
    p = successes / trials,
    d = 1 + (z * z) / trials,
    center = (p + (z * z) / (2 * trials)) / d,
    half =
      (z *
        Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) /
      d;
  return {
    rate: p,
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
    trials,
    successes,
  };
}
export function analyzeExperiment(x) {
  const arms = x.arms.map((a) => ({
    name: a.name,
    interval: wilson(a.successes, a.trials),
  }));
  const [a, b] = arms.map((r) => r.interval),
    difference =
      a && b
        ? {
            low: b.low - a.high,
            high: b.high - a.low,
            estimate: b.rate - a.rate,
          }
        : null;
  const ready = x.arms.every((a) => a.trials >= x.targetPerArm);
  const decision = !x.randomized
    ? "observational"
    : !ready
      ? "collect"
      : difference && (difference.low > 0 || difference.high < 0)
        ? "review-winner"
        : "inconclusive";
  return {
    id: x.id,
    name: x.name,
    arms,
    difference,
    decision,
    ready,
    stoppingRule: x.stoppingRule,
    caveat:
      "Conservative interval from separate Wilson bounds, not a calibrated hypothesis test. Prespecify duration, allocation and stopping; no causal winner from nonrandom groups or repeated peeking.",
  };
}
function groupKey(o) {
  return JSON.stringify([
    o.projectId,
    o.initiativeId || "",
    o.channel,
    o.metric,
    o.definition,
    o.currency || "",
    o.cohort || "",
  ]);
}
// Two totals cover the same window when their period lists are identical.
function windowSignature(periods) {
  return JSON.stringify(
    periods.toSorted((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  );
}
// A return rate is returns divided by starts for the same project, initiative, channel, cohort
// and window. It is derived here and never stored: the ledger holds counts, so a dashboard's
// percentage is recorded as the counts it implies. Without a cohort it is an observed ratio only.
function returnRates(totals) {
  return totals
    .filter((t) => t.metric === "returns")
    .map((r) => {
      const entry = (starts, rate, interpretation) => ({
        projectId: r.projectId,
        initiativeId: r.initiativeId,
        channel: r.channel,
        cohort: r.cohort,
        returns: r.value,
        starts: starts?.value ?? null,
        rate,
        returnsDefinition: r.definition,
        startsDefinition: starts?.definition ?? null,
        evidence: [...r.evidence, ...(starts?.evidence || [])],
        interpretation,
      });
      if (r.ambiguous)
        return entry(null, null, "Overlapping or mixed readings; reconcile them first");
      const matches = totals.filter(
        (s) =>
          s.metric === "starts" &&
          !s.ambiguous &&
          s.projectId === r.projectId &&
          s.initiativeId === r.initiativeId &&
          s.channel === r.channel &&
          s.cohort === r.cohort &&
          windowSignature(s.periods) === windowSignature(r.periods),
      );
      if (matches.length > 1)
        return entry(null, null, "More than one starts definition covers this window; keep one");
      const [s] = matches;
      if (!s || !(s.value > 0)) return entry(s, null, "No compatible denominator");
      if (r.value > s.value)
        return entry(s, null, "Returns exceed starts; they cannot be the same people");
      return entry(
        s,
        r.value / s.value,
        r.cohort
          ? "Cohort return rate"
          : "Observed ratio; returns may include people who started outside this window",
      );
    });
}
export function report(w, filter = {}) {
  const belongs = (r) =>
    (!filter.projectId || r.projectId === filter.projectId) &&
    (!filter.initiativeId || r.initiativeId === filter.initiativeId);
  const rows = w.observations.filter(
    (o) =>
      belongs(o) &&
      (!filter.from || o.start >= filter.from) &&
      (!filter.to || o.end <= filter.to),
  );
  const warnings = [];
  if (filter.from || filter.to)
    warnings.push(
      "Only observations fully contained in the date filter are included; period totals cannot be prorated.",
    );
  const grouped = new Map();
  for (const o of rows) {
    const key = groupKey(o);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(o);
  }
  const totals = [];
  const selected = [];
  for (const group of grouped.values()) {
    const snapshots = new Map();
    let periods = group.filter((o) => o.kind === "period");
    for (const o of group.filter((o) => o.kind === "snapshot")) {
      const old = snapshots.get(o.series);
      if (
        !old ||
        o.end > old.end ||
        (o.end === old.end && o.collectedAt > old.collectedAt)
      )
        snapshots.set(o.series, o);
    }
    const used = [...periods, ...snapshots.values()];
    selected.push(...used);
    periods = periods.toSorted((a, b) => a.start.localeCompare(b.start));
    const overlaps = periods.some((o, i) => i && o.start <= periods[i - 1].end);
    const mixed = periods.length && snapshots.size;
    if (overlaps || mixed)
      warnings.push(
        `${group[0].metric} on ${group[0].channel}: ${overlaps ? "overlapping periods" : "period and cumulative snapshot readings"}; inspect sources before adding.`,
      );
    const first = group[0];
    totals.push({
      ...Object.fromEntries(
        [
          "projectId",
          "initiativeId",
          "channel",
          "metric",
          "definition",
          "currency",
          "cohort",
        ].map((k) => [k, first[k]]),
      ),
      value: overlaps || mixed ? null : used.reduce((n, o) => n + o.value, 0),
      evidence: used.map((o) => o.id),
      periods: used.map((o) => ({ start: o.start, end: o.end, kind: o.kind })),
      ambiguous: !!(overlaps || mixed),
    });
  }
  const funnels = [];
  for (const t of totals.filter(
    (t) => t.metric === "visitors" && t.definition === "visitors",
  )) {
    const s = totals.find(
      (s) =>
        s.projectId === t.projectId &&
        s.initiativeId === t.initiativeId &&
        s.channel === t.channel &&
        s.metric === "starts" &&
        s.definition === "starts" &&
        s.cohort === t.cohort,
    );
    const sameWindow = s && windowSignature(s.periods) === windowSignature(t.periods);
    const rate =
      sameWindow && t.value > 0 && s.value !== null && s.value <= t.value
        ? s.value / t.value
        : null;
    funnels.push({
      channel: t.channel,
      initiativeId: t.initiativeId,
      visitors: t.value,
      starts: s?.value ?? null,
      rate,
      evidence: [...t.evidence, ...(s?.evidence || [])],
      interpretation:
        rate === null
          ? "No compatible denominator"
          : t.cohort
            ? "Cohort conversion"
            : "Observed ratio; counts may represent different people",
    });
  }
  const reactions = w.reactions.filter(
    (r) =>
      belongs(r) &&
      (!filter.from || r.collectedAt.slice(0, 10) >= filter.from) &&
      (!filter.to || r.collectedAt.slice(0, 10) <= filter.to),
  );
  const sentiment = {
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
    unknown: 0,
    unreviewed: 0,
  };
  for (const r of reactions) {
    if (!r.reviewed) sentiment.unreviewed++;
    else sentiment[r.sentiment]++;
  }
  const experiments = w.experiments.filter(belongs).map(analyzeExperiment);
  return {
    filter,
    uniqueReach: null,
    totals,
    observations: rows,
    reactions,
    sentiment,
    funnels,
    returnRates: returnRates(totals),
    experiments,
    competitors: w.competitors.filter(belongs),
    evidence: w.evidence.filter(belongs),
    sources: w.sources.filter(belongs),
    warnings: [
      ...warnings,
      "Platform audiences overlap. Unique reach and causal attribution are not inferred.",
      "Reactions are a self-selected sample; sentiment describes reviewed captured reactions only.",
    ],
  };
}
// ---- The plan check: gates, dependencies and maker hours ----------------------------------
// Dates are whole UTC days, so no clock, time zone or daylight saving enters the arithmetic.
const DAY = 86400000;
const dayNumber = (date) => Date.parse(date + "T00:00:00Z") / DAY;
// The calendar the ledger accepts runs from 0000-01-01 to 9999-12-31. A week that crosses either end
// is shown cut at it, so every boundary is a four-digit-year date like the ones the ledger stores.
const FIRST_DAY = dayNumber("0000-01-01"),
  LAST_DAY = dayNumber("9999-12-31");
const dayText = (n) => new Date(Math.min(LAST_DAY, Math.max(FIRST_DAY, n)) * DAY).toISOString().slice(0, 10);
// 1970-01-01 was a Thursday, so day 0 falls three days after a Monday.
const mondayOf = (n) => n - ((((n + 3) % 7) + 7) % 7);
const round2 = (x) => Math.round(x * 100) / 100 + 0;
const loadMethod =
  "Each initiative's hours are spread evenly over the days from its start to its end, both included. A calendar week, Monday to Sunday, receives the hours times the days of the initiative that fall in it, divided by its total days. Only leaf initiatives count: a parent initiative's own hours are ignored, because its children carry the work. A gate with both a due date and hours puts all its hours in the week it is due. An initiative without hours is unknown: it is listed for each week it is active and is never counted as zero. Weekly totals are rounded to two decimals, and a week is over the cap when its rounded total exceeds the project's weeklyHours.";
const gateSettled = (g) => g.status === "passed" || g.status === "waived";
// What an initiative still waits on: gates not passed or waived and initiatives not complete.
// A dependency that cannot be found in the project counts as unmet, never as satisfied.
function unmetDependencies(i, gates, initiatives) {
  return (i.dependsOn ?? []).flatMap((id) => {
    const gate = gates.get(id);
    if (gate)
      return gateSettled(gate) ? [] : [{ id, kind: "gate", name: gate.name, status: gate.status }];
    const other = initiatives.get(id);
    if (other)
      return other.status === "complete" ? [] : [{ id, kind: "initiative", name: other.name, status: other.status }];
    return [{ id, kind: "missing", name: id, status: "missing" }];
  });
}
// The weeks drawn are limited to MAX_WEEKS from the earliest start, so one mistyped year cannot make
// the plan, the page and the advice build and carry half a million weeks. The count left out is
// returned, with the span the initiatives cover, for the caller to say so.
const MAX_WEEKS = 260;
// A gate puts its hours in the week of its due date, and only a gate with both is counted.
const datedGate = (g) => g.due !== undefined && Number.isFinite(g.hours);
function weeklyLoad(weeklyHours, initiatives, gates = []) {
  const weeks = new Map(),
    dated = gates.filter(datedGate);
  let first = Infinity,
    last = -Infinity,
    from = Infinity,
    to = -Infinity;
  for (const i of initiatives) {
    const start = dayNumber(i.start),
      end = dayNumber(i.end);
    first = Math.min(first, mondayOf(start));
    last = Math.max(last, mondayOf(end));
    from = Math.min(from, start);
    to = Math.max(to, end);
  }
  for (const g of dated) {
    const day = dayNumber(g.due);
    first = Math.min(first, mondayOf(day));
    last = Math.max(last, mondayOf(day));
    from = Math.min(from, day);
    to = Math.max(to, day);
  }
  const stop = Math.min(last, first + (MAX_WEEKS - 1) * 7);
  for (const i of initiatives) {
    const start = dayNumber(i.start),
      end = dayNumber(i.end),
      days = end - start + 1;
    for (let monday = mondayOf(start); monday <= Math.min(end, stop); monday += 7) {
      if (!weeks.has(monday)) weeks.set(monday, { shares: [], unknown: [], gates: [] });
      const week = weeks.get(monday);
      if (!Number.isFinite(i.hours)) week.unknown.push(i.id);
      else {
        const share = (i.hours * (Math.min(end, monday + 6) - Math.max(start, monday) + 1)) / days;
        if (share > 0) week.shares.push({ id: i.id, share });
      }
    }
  }
  for (const g of dated) {
    const monday = mondayOf(dayNumber(g.due));
    if (monday > stop || !(g.hours > 0)) continue;
    if (!weeks.has(monday)) weeks.set(monday, { shares: [], unknown: [], gates: [] });
    weeks.get(monday).gates.push({ id: g.id, share: g.hours });
  }
  const list = [];
  for (let monday = first; monday <= stop; monday += 7) {
    const { shares, unknown, gates: due } = weeks.get(monday) ?? { shares: [], unknown: [], gates: [] },
      hours = round2(shares.reduce((n, x) => n + x.share, 0) + due.reduce((n, x) => n + x.share, 0)),
      overBy = hours > weeklyHours ? round2(hours - weeklyHours) : 0;
    list.push({
      start: dayText(monday),
      end: dayText(monday + 6),
      hours,
      cap: weeklyHours,
      overCap: overBy > 0,
      overBy,
      initiatives: shares.map((x) => ({ id: x.id, hours: round2(x.share) })),
      gates: due.map((x) => ({ id: x.id, hours: round2(x.share) })),
      unknownHours: unknown,
    });
  }
  return {
    weeks: list,
    omitted: last >= first ? (last - first) / 7 + 1 - list.length : 0,
    from: dayText(from),
    to: dayText(to),
  };
}
const describeDependency = (d) =>
  d.kind === "missing" ? `"${d.id}" (not found)` : `${d.kind} "${d.id}" (${d.status})`;
// A list for a sentence: the first few, then how many more, so one record with thousands of
// dependencies cannot make a message of thousands of names.
const some = (items, show, limit = 5) =>
  items.slice(0, limit).map(show).join(", ") + (items.length > limit ? `, and ${items.length - limit} more` : "");
// Parent initiatives group others for reading; only a leaf carries hours. `families` maps each
// parent that exists in the project to its direct children, in record order.
function families(rows) {
  const ids = new Set(rows.map((i) => i.id)),
    family = new Map();
  for (const i of rows)
    if (i.parentId !== undefined && i.parentId !== i.id && ids.has(i.parentId)) {
      if (!family.has(i.parentId)) family.set(i.parentId, []);
      family.get(i.parentId).push(i.id);
    }
  return family;
}
// Every initiative below one, nearest first. The seen set keeps a hand-made cycle from looping.
function descendants(id, family) {
  const seen = new Set([id]),
    queue = [id];
  for (let n = 0; n < queue.length; n++)
    for (const child of family.get(queue[n]) ?? [])
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
  return queue.slice(1);
}
// A parent is complete when all its children are, running when any is, else planned while any
// child is still planned and paused otherwise. A child that is itself a parent counts as its own
// derived status.
function derivedStatus(id, family, byId, path = new Set()) {
  const children = family.get(id);
  if (!children || path.has(id)) return byId.get(id).status;
  const states = children.map((c) => derivedStatus(c, family, byId, new Set([...path, id])));
  return states.every((s) => s === "complete")
    ? "complete"
    : states.includes("running")
      ? "running"
      : states.includes("planned")
        ? "planned"
        : "paused";
}
// Gates passed of gates, actions done of actions, over a set of initiative IDs. A gate counts when
// an initiative in the set waits on it or names it as its own; a dropped action no longer counts.
function progressOf(ids, rows, gates, actions) {
  const wanted = new Set(
    rows.filter((i) => ids.has(i.id)).flatMap((i) => i.dependsOn ?? []),
  );
  for (const g of gates) if (ids.has(g.initiativeId)) wanted.add(g.id);
  const mine = gates.filter((g) => wanted.has(g.id)),
    todo = actions.filter((a) => ids.has(a.initiativeId) && a.status !== "dropped");
  return {
    gatesPassed: mine.filter(gateSettled).length,
    gatesTotal: mine.length,
    actionsDone: todo.filter((a) => a.status === "done").length,
    actionsTotal: todo.length,
  };
}
// Gates with their status, whether each initiative is blocked and by what, the maker hours per
// calendar week against the project's weeklyHours, and the initiative budgets against its
// budget. Reads one project only. A pure function of the ledger: no clock, nothing is written.
export function plan(w, projectId) {
  const project = w.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project does not exist");
  const rows = w.initiatives.filter((i) => i.projectId === projectId),
    ownGates = (w.gates ?? []).filter((g) => g.projectId === projectId),
    ownActions = (w.actions ?? []).filter((a) => a.projectId === projectId),
    gates = new Map(ownGates.map((g) => [g.id, g])),
    byId = new Map(rows.map((i) => [i.id, i])),
    family = families(rows),
    leaves = rows.filter((i) => !family.has(i.id)),
    warnings = [],
    requiredBy = new Map();
  for (const i of rows)
    for (const id of i.dependsOn ?? []) {
      if (!requiredBy.has(id)) requiredBy.set(id, []);
      requiredBy.get(id).push(i.id);
    }
  const initiatives = rows.map((i) => {
    const unmet = unmetDependencies(i, gates, byId),
      children = family.get(i.id) ?? [],
      below = children.length ? descendants(i.id, family) : [],
      leafBelow = below.filter((id) => !family.has(id)).map((id) => byId.get(id)),
      ids = new Set([i.id, ...below]),
      progress = progressOf(ids, rows, ownGates, ownActions);
    if (unmet.length && (i.status === "running" || i.status === "complete"))
      warnings.push(`Initiative "${i.id}" is ${i.status} although it waits on ${some(unmet, describeDependency)}`);
    if (children.length && Number.isFinite(i.hours))
      warnings.push(
        `Initiative "${i.id}" has children; its own ${i.hours} hours are ignored and its leaf initiatives' hours are counted instead`,
      );
    const known = leafBelow.filter((l) => Number.isFinite(l.hours)),
      rollup = children.length
        ? {
            start: leafBelow.reduce((a, l) => (l.start < a ? l.start : a), leafBelow[0].start),
            end: leafBelow.reduce((a, l) => (l.end > a ? l.end : a), leafBelow[0].end),
            hours: known.length ? round2(known.reduce((n, l) => n + l.hours, 0)) : null,
            unknownHours: leafBelow.filter((l) => !Number.isFinite(l.hours)).map((l) => l.id),
            status: derivedStatus(i.id, family, byId),
            progress,
          }
        : null;
    return {
      id: i.id,
      name: i.name,
      channel: i.channel,
      status: i.status,
      start: i.start,
      end: i.end,
      hours: rollup ? rollup.hours : Number.isFinite(i.hours) ? i.hours : null,
      budget: i.budget,
      note: i.note ?? null,
      parentId: byId.has(i.parentId) ? i.parentId : null,
      children,
      dependsOn: i.dependsOn ?? [],
      blocked: i.status !== "complete" && unmet.length > 0,
      blockedBy: i.status === "complete" ? [] : unmet,
      overCapWeeks: [],
      rollup,
      progress,
    };
  });
  const { weeks, omitted, from, to } = weeklyLoad(project.weeklyHours, leaves, ownGates),
    entry = new Map(initiatives.map((i) => [i.id, i])),
    gateWeeks = new Map(ownGates.map((g) => [g.id, []]));
  for (const week of weeks)
    if (week.overCap) {
      for (const { id } of week.initiatives) entry.get(id).overCapWeeks.push(week.start);
      for (const { id } of week.gates) gateWeeks.get(id).push(week.start);
    }
  // A parent shows the over-cap weeks of the leaves below it.
  for (const i of initiatives)
    if (i.children.length)
      i.overCapWeeks = [...new Set(descendants(i.id, family).flatMap((id) => entry.get(id).overCapWeeks))].toSorted();
  if (omitted)
    warnings.unshift(
      `The weekly load covers ${weeks.length} weeks (${weeks[0].start} to ${weeks.at(-1).end}) of the ${weeks.length + omitted} that the initiatives span (${from} to ${to}); the later ${omitted} are left out. Check the initiative dates.`,
    );
  const unknownHours = initiatives.filter((i) => !i.rollup && i.hours === null).map((i) => i.id);
  if (unknownHours.length)
    warnings.unshift(
      `${unknownHours.length} initiative${unknownHours.length === 1 ? " has" : "s have"} no hours (${some(unknownHours, String)}); the weekly load counts only initiatives with hours.`,
    );
  for (const i of rows)
    if (i.status !== "complete")
      for (const id of i.dependsOn ?? []) {
        const dep = byId.get(id);
        if (dep && dep.status !== "complete" && i.start < dep.end)
          warnings.push(`Initiative "${i.id}" starts ${i.start} before its dependency "${dep.id}" ends ${dep.end}`);
      }
  for (const g of ownGates) {
    if (g.status === "passed" && !g.evidenceIds?.length) warnings.push(`Gate "${g.id}" is passed but cites no evidence`);
    if (g.status === "waived" && !g.notes) warnings.push(`Gate "${g.id}" is waived without a note saying why`);
    if (g.hours !== undefined && g.due === undefined)
      warnings.push(`Gate "${g.id}" has hours but no due date; its hours are not in the weekly load`);
  }
  const gateHours = round2(ownGates.filter(datedGate).reduce((n, g) => n + g.hours, 0)),
    planned = round2(rows.reduce((n, i) => n + i.budget, 0)),
    overBy = planned > project.budget ? round2(planned - project.budget) : 0,
    peak = weeks.reduce((best, x) => (x.hours > (best?.hours ?? 0) ? x : best), null);
  return {
    projectId,
    weeklyHours: project.weeklyHours,
    gates: ownGates.map((g) => ({
      id: g.id,
      name: g.name,
      criteria: g.criteria,
      status: g.status,
      checkedAt: g.checkedAt ?? null,
      evidenceIds: g.evidenceIds ?? [],
      notes: g.notes ?? null,
      due: g.due ?? null,
      hours: Number.isFinite(g.hours) ? g.hours : null,
      initiativeId: g.initiativeId ?? null,
      overCapWeeks: gateWeeks.get(g.id),
      requiredBy: requiredBy.get(g.id) ?? [],
    })),
    initiatives,
    load: {
      method: loadMethod,
      weeklyHours: project.weeklyHours,
      totalHours: round2(
        leaves.reduce((n, i) => n + (Number.isFinite(i.hours) ? i.hours : 0), 0) + gateHours,
      ),
      gateHours,
      capacityHours: round2(project.weeklyHours * weeks.length),
      unknownHours,
      omittedWeeks: omitted,
      weeks,
    },
    budget: {
      currency: project.currency,
      cap: project.budget,
      planned,
      remaining: round2(project.budget - planned),
      overBudget: overBy > 0,
      overBy,
    },
    summary: {
      gates: Object.fromEntries(["open", "passed", "failed", "waived"].map((s) => [s, ownGates.filter((g) => g.status === s).length])),
      blocked: initiatives.filter((i) => i.blocked).length,
      overCapWeeks: weeks.filter((x) => x.overCap).length,
      peakWeek: peak && { start: peak.start, hours: peak.hours },
      withoutHours: unknownHours.length,
    },
    warnings,
  };
}
// ---- Attention: what needs the owner now ---------------------------------------------------
// Work that falls due within this many days is shown; an open decision more than STALE_DAYS past
// its date is stale.
const SOON_DAYS = 14,
  STALE_DAYS = 7,
  RECENT_UPDATES = 10;
const byDaysLeft = (a, b) =>
  (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.id.localeCompare(b.id);
// The local calendar date as YYYY-MM-DD: the day the owner is living in, not the UTC day.
export function localDate(now = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
// What needs the owner now, most urgent first, for one project. `today` is a YYYY-MM-DD date the
// caller supplies, so this is a pure function of the ledger and that date: it reads no clock.
// daysLeft is the whole days from today to a date, negative once the date has passed.
export function attention(w, projectId, today) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(dayNumber(today)) || dayText(dayNumber(today)) !== today)
    throw new Error("today must be a real YYYY-MM-DD date");
  const p = plan(w, projectId),
    now = dayNumber(today),
    left = (date) => (date === undefined ? null : dayNumber(date) - now),
    mine = (rows) => (rows ?? []).filter((r) => r.projectId === projectId),
    decisions = mine(w.decisions)
      .filter((d) => d.status === "open" || (d.status === "deferred" && left(d.needBy) !== null && left(d.needBy) <= 0))
      .map((d) => ({
        id: d.id,
        title: d.title,
        question: d.question,
        status: d.status,
        needBy: d.needBy ?? null,
        daysLeft: left(d.needBy),
        overdue: left(d.needBy) !== null && left(d.needBy) < 0,
        recommendation: d.recommendation ?? null,
        defaultIfSilent: d.defaultIfSilent ?? null,
        optionCount: d.options.length,
        initiativeId: d.initiativeId ?? null,
        reportId: d.reportId ?? null,
      }))
      .toSorted(byDaysLeft),
    actions = mine(w.actions)
      .filter((a) => a.owner === "owner" && ["todo", "doing", "blocked"].includes(a.status))
      .map((a) => ({ a, daysLeft: left(a.due) }))
      .filter(({ a, daysLeft }) => a.status === "blocked" || (daysLeft !== null && daysLeft <= SOON_DAYS))
      .map(({ a, daysLeft }) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        due: a.due ?? null,
        daysLeft,
        overdue: daysLeft !== null && daysLeft < 0,
        reason: a.status === "blocked" ? "blocked" : daysLeft < 0 ? "overdue" : "due-soon",
        blockedBy: a.blockedBy ?? null,
        hours: Number.isFinite(a.hours) ? a.hours : null,
        initiativeId: a.initiativeId ?? null,
        gateId: a.gateId ?? null,
        decisionId: a.decisionId ?? null,
      }))
      .toSorted(byDaysLeft),
    initiativeById = new Map(p.initiatives.map((i) => [i.id, i])),
    gates = p.gates
      .filter((g) => (g.status === "open" || g.status === "failed") && g.due !== null && left(g.due) <= SOON_DAYS)
      .map((g) => ({
        id: g.id,
        name: g.name,
        criteria: g.criteria,
        status: g.status,
        due: g.due,
        daysLeft: left(g.due),
        overdue: left(g.due) < 0,
        hours: g.hours,
        initiativeId: g.initiativeId,
        blocks: g.requiredBy
          .map((id) => initiativeById.get(id))
          .filter((i) => i && i.status !== "complete")
          .map((i) => ({ id: i.id, name: i.name, status: i.status })),
      }))
      .toSorted(byDaysLeft),
    blockedInitiatives = p.initiatives
      .filter((i) => i.blocked && (i.status === "running" || (i.status === "planned" && left(i.start) <= SOON_DAYS)))
      .map((i) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        start: i.start,
        daysToStart: left(i.start),
        blocker: i.blockedBy[0],
      }))
      .toSorted((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
    // Collateral to choose between: an open slot with two or more live candidates. One candidate is
    // nothing to choose, and a rejected or retired one is out of the running.
    live = Map.groupBy(mine(w.assets).filter((a) => a.status === "candidate"), (a) => a.slotId),
    picks = mine(w.assetSlots)
      .filter((s) => s.status === "open")
      .map((s) => ({ s, ids: (live.get(s.id) ?? []).map((a) => a.id) }))
      .filter(({ ids }) => ids.length >= 2)
      .map(({ s, ids }) => ({ slotId: s.id, name: s.name, candidates: ids.length, candidateIds: ids, initiativeId: s.initiativeId ?? null }))
      .toSorted((a, b) => a.name.localeCompare(b.name) || a.slotId.localeCompare(b.slotId)),
    stale = decisions
      .filter((d) => d.status === "open" && d.daysLeft !== null && d.daysLeft < -STALE_DAYS)
      .map((d) => ({ id: d.id, title: d.title, needBy: d.needBy, daysOverdue: -d.daysLeft }))
      .toSorted((a, b) => b.daysOverdue - a.daysOverdue || a.id.localeCompare(b.id)),
    // Newest first; updates in the same instant keep the later record first.
    recent = mine(w.updates)
      .map((u, n) => ({ u, n }))
      .toSorted((a, b) => b.u.at.localeCompare(a.u.at) || b.n - a.n)
      .slice(0, RECENT_UPDATES)
      .map(({ u }) => u);
  return {
    projectId,
    today,
    decisions,
    actions,
    gates,
    blockedInitiatives,
    picks,
    stale,
    recent,
    summary: {
      decisions: decisions.length,
      overdueDecisions: decisions.filter((d) => d.overdue).length,
      actions: actions.length,
      overdueActions: actions.filter((a) => a.overdue).length,
      gates: gates.length,
      overdueGates: gates.filter((g) => g.overdue).length,
      blockedInitiatives: blockedInitiatives.length,
      picks: picks.length,
      stale: stale.length,
      total: decisions.length + actions.length + gates.length + blockedInitiatives.length + picks.length,
    },
  };
}
// Actions from the plan check, present only when a ledger records gates, dependencies or hours.
// `over` holds the over-cap weeks of work that is not yet complete: finished work cannot be moved
// out of a week, so a week that is over the cap only because of it is not something to act on.
// The plan itself still lists every status, as the record of what was planned.
function planActions(project, p, over) {
  const actions = [],
    initiativeById = new Map(p.initiatives.map((i) => [i.id, i])),
    gateById = new Map(p.gates.map((g) => [g.id, g])),
    name = (id) => initiativeById.get(id).name,
    byStart = p.initiatives.toSorted((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const running = byStart.filter((i) => i.status === "running" && i.blocked);
  if (running.length) {
    const blocking = new Set(running.flatMap((i) => i.blockedBy.map((b) => b.id))),
      gate = p.gates.find((g) => blocking.has(g.id)),
      shown = running.slice(0, 3);
    actions.push({
      kind: "readiness",
      priority: 1,
      title: "Running work is ahead of its gate",
      reason: `${shown.map((i) => `${i.name} (running) waits on ${some(i.blockedBy, (b) => `${b.name} (${b.status})`)}`).join("; ")}${running.length > 3 ? `; and ${running.length - 3} more` : ""}.`,
      next: gate
        ? `Check ${gate.name} against its pass condition: ${gate.criteria}. Pause the running work until it passes, or waive the gate with a note if the owner accepts the risk.`
        : `Finish ${some(running[0].blockedBy, (b) => b.name)} first, or pause the running work.`,
      stop: "Decide in this review: pause the work, or record the gate as passed, failed or waived with a note, using marketing put gates.",
      evidence: [],
      referenceIds: [],
    });
  }
  const held = new Map();
  for (const i of byStart)
    if (i.status !== "running" && i.blocked)
      for (const b of i.blockedBy)
        if (b.kind === "gate") {
          if (!held.has(b.id)) held.set(b.id, []);
          held.get(b.id).push(i);
        }
  if (held.size) {
    const entries = [...held].map(([id, work]) => ({ gate: gateById.get(id), work })),
      shown = entries.slice(0, 3),
      first = entries[0];
    actions.push({
      kind: "readiness",
      priority: 2,
      title: "Settle the gate that holds up planned work",
      reason: `Planned work is waiting on gates: ${shown.map((e) => `${e.gate.name} (${e.gate.status}) holds ${some(e.work, (i) => i.name)}`).join("; ")}${entries.length > 3 ? `; and ${entries.length - 3} more` : ""}.`,
      next: `Start with ${first.gate.name}, which holds the earliest start (${first.work[0].name}, ${first.work[0].start}). Its pass condition: ${first.gate.criteria}.${first.gate.status === "failed" ? " It failed its last check: fix the cause and check it again, or change the plan." : ""}`,
      stop: "Check it once against the pass condition, then record passed, failed or waived with a note using marketing put gates. Do not start the held initiatives before then.",
      evidence: [],
      referenceIds: [],
    });
  }
  if (over.length) {
    const n = over.length,
      unknown = p.load.unknownHours.filter((id) => initiativeById.get(id).status !== "complete").map(name),
      finished = p.initiatives.some((i) => i.status === "complete" && i.hours > 0);
    actions.push({
      kind: "capacity",
      priority: 2,
      title: "Planned hours exceed the weekly cap",
      reason: `${n} week${n === 1 ? " exceeds" : "s exceed"} the ${project.weeklyHours} hour weekly cap: ${over.slice(0, 3).map((x) => `${x.start} (${x.hours} h, ${x.overBy} over)`).join(", ")}${n > 3 ? `, and ${n - 3} more` : ""}.${finished ? " Completed initiatives are not counted." : ""}${unknown.length ? ` Initiatives without hours are not counted: ${some(unknown, String)}.` : ""}`,
      next: `Move work out of the heaviest week, shorten or drop an initiative, or ask the owner to raise the cap. Then run marketing plan ${project.id} again.`,
      stop: "Do not add an initiative to a week that is already over the cap.",
      evidence: [],
      referenceIds: [],
    });
  }
  return actions;
}
// The first action when the owner has decisions, actions or gates to settle, from attention(). A
// blocked initiative is not counted here: the readiness actions already say what it waits on.
function attentionAction(a) {
  const d = a.decisions,
    parts = [];
  const when = (daysLeft, date, past = "overdue") =>
    daysLeft === null ? "no date" : daysLeft < 0 ? `${past} since ${date}` : `needed by ${date}`;
  if (d.length)
    parts.push(
      `${d.length} open decision${d.length === 1 ? "" : "s"}: ${some(d, (x) => `${x.title} (${when(x.daysLeft, x.needBy)})`, 3)}${a.stale.length ? `; ${a.stale.length} waited more than ${STALE_DAYS} days past the date` : ""}`,
    );
  if (a.actions.length)
    parts.push(
      `${a.actions.length} owner action${a.actions.length === 1 ? "" : "s"} due or blocked: ${some(a.actions, (x) => `${x.title} (${x.reason === "blocked" ? "blocked" : when(x.daysLeft, x.due, "overdue")})`, 3)}`,
    );
  if (a.gates.length)
    parts.push(
      `${a.gates.length} gate${a.gates.length === 1 ? "" : "s"} due or overdue: ${some(a.gates, (x) => `${x.name} (${when(x.daysLeft, x.due)})`, 3)}`,
    );
  return {
    kind: "attention",
    priority: 0,
    title: "Decisions and actions are waiting on the owner",
    reason: parts.join(". ") + ".",
    next: `Run marketing next ${a.projectId} for the full list.${d.length ? " Settle a decision with marketing decide <decision-id> --option <option-id>, or move it with marketing defer <decision-id> --until <date>." : ""}${a.actions.length ? " Close an action with marketing action status <action-id> done." : ""}${a.gates.length ? " Record a gate check with marketing gate set <gate-id> --status passed|failed|waived." : ""}`,
    stop: "Settle or defer each decision before starting work that depends on it; an undecided question is the default to stop at.",
    evidence: [],
    referenceIds: [],
  };
}
// `today` is the date the owner's deadlines are measured from; it defaults to the local date.
export function advise(w, projectId, filter = {}, today = localDate()) {
  const project = w.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project does not exist");
  const r = report(w, { ...filter, projectId }),
    p = plan(w, projectId),
    actions = [],
    owed = attention(w, projectId, today);
  if (owed.decisions.length + owed.actions.length + owed.gates.length) actions.push(attentionAction(owed));
  for (const f of r.funnels)
    if (f.rate !== null && f.rate < 0.2)
      actions.push({
        kind: "activation",
        priority: 1,
        title: "Learn why visitors do not start",
        reason: `${f.starts} starts / ${f.visitors} visitors (${Math.round(f.rate * 100)}% observed ratio) on ${f.channel}. The 20% trigger is a house heuristic, not a benchmark.`,
        next: "Observe three intended users trying the first session. Change one friction point, then measure the same attributed cohort.",
        stop: "Stop after three sessions or two hours; record whether the same obstacle repeats.",
        evidence: f.evidence,
        referenceIds: ["experimentation", "measurement"],
        ruleIds: ["activation-investigation"],
      });
  // Finished work and settled gates cannot be moved out of a week, so only the rest is compared to the cap.
  const own = w.initiatives.filter((i) => i.projectId === projectId),
    parents = families(own),
    unfinished = own.filter((i) => i.status !== "complete" && !parents.has(i.id)),
    openGates = (w.gates ?? []).filter((g) => g.projectId === projectId && !gateSettled(g)),
    everything = unfinished.length === p.initiatives.filter((i) => !i.rollup).length && openGates.length === p.gates.length;
  actions.push(
    ...planActions(
      project,
      p,
      (everything ? p.load.weeks : weeklyLoad(project.weeklyHours, unfinished, openGates).weeks).filter((x) => x.overCap),
    ),
  );
  // What the project's stage is for: a first session for a prototype, the best channel for a beta,
  // who returns for a launched project. An idea has nothing to try, so its viability and channel
  // actions carry the stage instead. A project with no usable stage gets none of this.
  const staged = stageAction(project, r, p);
  if (staged) actions.push(staged);
  const gaps = ["problem", "activation", "retention", "payment"].filter(
    (d) =>
      !w.evidence.some(
        (e) =>
          e.projectId === projectId &&
          e.dimension === d &&
          e.strength === "primary" &&
          e.result === "supports" &&
          // A product-fact describes the project, not its audience, so it fills no demand gap.
          e.status !== "product-fact",
      ),
  );
  const guide = viabilityGuide(project, gaps);
  actions.push({
    kind: "viability",
    priority: guide?.priority ?? 2,
    title:
      guide?.title ??
      (gaps.length
        ? "Collect missing viability evidence"
        : "Review viability evidence"),
    reason:
      (gaps.length
        ? `Missing primary support: ${gaps.join(", ")}. Views and favorable reactions do not fill these gaps.`
        : "All four dimensions have supporting records; inspect samples, contradictions and dates before committing money.") +
      (guide ? ` ${guide.reason}` : ""),
    next:
      guide?.next ??
      (project.category === "game"
        ? "Measure second-session return in a defined player cohort and ask intended players what would make them come back."
        : "Interview intended users about a recent instance of the problem; test activation, repeat use and an honest price offer."),
    stop: `Keep the next test within ${project.weeklyHours} hours and ${project.budget} ${project.currency}; decide the success criterion before running.`,
    evidence: w.evidence
      .filter((e) => e.projectId === projectId)
      .map((e) => e.id),
    referenceIds: ["discovery", "experimentation", "measurement"],
    ruleIds: ["viability-dimensions", ...(guide?.ruleIds ?? [])],
  });
  const negatives = r.reactions.filter(
    (x) => x.reviewed && ["negative", "mixed"].includes(x.sentiment),
  );
  if (negatives.length)
    actions.push({
      kind: "reception",
      priority: 1,
      title: "Investigate repeated objections",
      reason: `${negatives.length} reviewed mixed/negative reactions in the captured sample.`,
      next: "Group by theme, read the source context, distinguish usability from positioning and ask permission before quoting private feedback.",
      stop: "Review up to five source threads; choose one objection to test.",
      evidence: negatives.map((x) => x.id),
      referenceIds: ["sentiment"],
      ruleIds: ["comments-are-a-sample", "sentiment-needs-review"],
    });
  if (
    !w.initiatives.some(
      (x) => x.projectId === projectId && x.status === "running",
    )
  ) {
    const channel = channelGuide(project);
    actions.push({
      kind: "channel",
      priority: 3,
      title: channel?.title ?? "Run one focused channel test",
      reason: channel?.reason ?? "No running initiative is recorded.",
      next:
        (channel?.next ??
          "Choose the channel where the intended audience already discusses this problem. Write a native contribution with a single measurable CTA.") +
        (channel?.nextSuffix ?? ""),
      stop:
        channel?.stop ??
        "Prespecify a seven-day window and an effort cap; record visits, activation and reaction context.",
      evidence: [],
      referenceIds: channel?.referenceIds ?? ["channels"],
      ruleIds: channel?.ruleIds ?? ["audience-before-channel"],
    });
  }
  // Actions from the plan check cite no rule; they read the gates, dependencies and hours the
  // ledger records (docs/CLI.md).
  return actions
    .map((a) => ({ ...a, ruleIds: a.ruleIds ?? [] }))
    .toSorted((a, b) => a.priority - b.priority);
}
export function sentimentSuggestion(text) {
  const words = text.toLowerCase(),
    positive = /\b(love|great|excellent|useful|beautiful|fun|helpful)\b/.test(
      words,
    ),
    negative =
      /\b(hate|terrible|broken|bad|confusing|boring|frustrating)\b/.test(words);
  return {
    label:
      positive && negative
        ? "mixed"
        : /\b(not|never|sarcasm|yeah right)\b/.test(words)
          ? "unknown"
          : positive
            ? "positive"
            : negative
              ? "negative"
              : "unknown",
    reviewed: false,
    method:
      "Small English keyword heuristic; review negation, sarcasm, context and other languages manually.",
  };
}
export { chartKey, chartLabel } from "./chart-key.mjs";
