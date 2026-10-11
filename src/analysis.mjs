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
const dayText = (n) => new Date(n * DAY).toISOString().slice(0, 10);
// 1970-01-01 was a Thursday, so day 0 falls three days after a Monday.
const mondayOf = (n) => n - ((((n + 3) % 7) + 7) % 7);
const round2 = (x) => Math.round(x * 100) / 100 + 0;
const loadMethod =
  "Each initiative's hours are spread evenly over the days from its start to its end, both included. A calendar week, Monday to Sunday, receives the hours times the days of the initiative that fall in it, divided by its total days. An initiative without hours is unknown: it is listed for each week it is active and is never counted as zero. Weekly totals are rounded to two decimals, and a week is over the cap when its rounded total exceeds the project's weeklyHours.";
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
function weeklyLoad(weeklyHours, initiatives) {
  const weeks = new Map();
  let first = Infinity,
    last = -Infinity;
  for (const i of initiatives) {
    const start = dayNumber(i.start),
      end = dayNumber(i.end),
      days = end - start + 1;
    first = Math.min(first, mondayOf(start));
    last = Math.max(last, mondayOf(end));
    for (let monday = mondayOf(start); monday <= end; monday += 7) {
      if (!weeks.has(monday)) weeks.set(monday, { shares: [], unknown: [] });
      const week = weeks.get(monday);
      if (!Number.isFinite(i.hours)) week.unknown.push(i.id);
      else {
        const share = (i.hours * (Math.min(end, monday + 6) - Math.max(start, monday) + 1)) / days;
        if (share > 0) week.shares.push({ id: i.id, share });
      }
    }
  }
  const list = [];
  for (let monday = first; monday <= last; monday += 7) {
    const { shares, unknown } = weeks.get(monday) ?? { shares: [], unknown: [] },
      hours = round2(shares.reduce((n, x) => n + x.share, 0)),
      overBy = hours > weeklyHours ? round2(hours - weeklyHours) : 0;
    list.push({
      start: dayText(monday),
      end: dayText(monday + 6),
      hours,
      cap: weeklyHours,
      overCap: overBy > 0,
      overBy,
      initiatives: shares.map((x) => ({ id: x.id, hours: round2(x.share) })),
      unknownHours: unknown,
    });
  }
  return list;
}
const describeDependency = (d) =>
  d.kind === "missing" ? `"${d.id}" (not found)` : `${d.kind} "${d.id}" (${d.status})`;
// Gates with their status, whether each initiative is blocked and by what, the maker hours per
// calendar week against the project's weeklyHours, and the initiative budgets against its
// budget. Reads one project only. A pure function of the ledger: no clock, nothing is written.
export function plan(w, projectId) {
  const project = w.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project does not exist");
  const rows = w.initiatives.filter((i) => i.projectId === projectId),
    ownGates = (w.gates ?? []).filter((g) => g.projectId === projectId),
    gates = new Map(ownGates.map((g) => [g.id, g])),
    byId = new Map(rows.map((i) => [i.id, i])),
    warnings = [];
  const initiatives = rows.map((i) => {
    const unmet = unmetDependencies(i, gates, byId);
    if (unmet.length && (i.status === "running" || i.status === "complete"))
      warnings.push(`Initiative "${i.id}" is ${i.status} although it waits on ${unmet.map(describeDependency).join(", ")}`);
    return {
      id: i.id,
      name: i.name,
      channel: i.channel,
      status: i.status,
      start: i.start,
      end: i.end,
      hours: Number.isFinite(i.hours) ? i.hours : null,
      budget: i.budget,
      dependsOn: i.dependsOn ?? [],
      blocked: i.status !== "complete" && unmet.length > 0,
      blockedBy: i.status === "complete" ? [] : unmet,
      overCapWeeks: [],
    };
  });
  const weeks = weeklyLoad(project.weeklyHours, rows);
  for (const week of weeks)
    if (week.overCap)
      for (const { id } of week.initiatives) initiatives.find((i) => i.id === id).overCapWeeks.push(week.start);
  const unknownHours = initiatives.filter((i) => i.hours === null).map((i) => i.id);
  if (unknownHours.length)
    warnings.unshift(
      `${unknownHours.length} initiative${unknownHours.length === 1 ? " has" : "s have"} no hours (${unknownHours.join(", ")}); the weekly load counts only initiatives with hours.`,
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
  }
  const planned = round2(rows.reduce((n, i) => n + i.budget, 0)),
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
      requiredBy: rows.filter((i) => i.dependsOn?.includes(g.id)).map((i) => i.id),
    })),
    initiatives,
    load: {
      method: loadMethod,
      weeklyHours: project.weeklyHours,
      totalHours: round2(rows.reduce((n, i) => n + (Number.isFinite(i.hours) ? i.hours : 0), 0)),
      capacityHours: round2(project.weeklyHours * weeks.length),
      unknownHours,
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
// Actions from the plan check, present only when a ledger records gates, dependencies or hours.
// `over` holds the over-cap weeks of work that is not yet complete: finished work cannot be moved
// out of a week, so a week that is over the cap only because of it is not something to act on.
// The plan itself still lists every status, as the record of what was planned.
function planActions(project, p, over) {
  const actions = [],
    name = (id) => p.initiatives.find((i) => i.id === id).name,
    byStart = p.initiatives.toSorted((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const running = byStart.filter((i) => i.status === "running" && i.blocked);
  if (running.length) {
    const gate = p.gates.find((g) => running.some((i) => i.blockedBy.some((b) => b.id === g.id)));
    actions.push({
      kind: "readiness",
      priority: 1,
      title: "Running work is ahead of its gate",
      reason: `${running.map((i) => `${i.name} (running) waits on ${i.blockedBy.map((b) => `${b.name} (${b.status})`).join(", ")}`).join("; ")}.`,
      next: gate
        ? `Check ${gate.name} against its pass condition: ${gate.criteria}. Pause the running work until it passes, or waive the gate with a note if the owner accepts the risk.`
        : `Finish ${running[0].blockedBy.map((b) => b.name).join(", ")} first, or pause the running work.`,
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
    const entries = [...held].map(([id, work]) => ({ gate: p.gates.find((g) => g.id === id), work })),
      shown = entries.slice(0, 3),
      first = entries[0];
    actions.push({
      kind: "readiness",
      priority: 2,
      title: "Settle the gate that holds up planned work",
      reason: `Planned work is waiting on gates: ${shown.map((e) => `${e.gate.name} (${e.gate.status}) holds ${e.work.map((i) => i.name).join(", ")}`).join("; ")}${entries.length > 3 ? `; and ${entries.length - 3} more` : ""}.`,
      next: `Start with ${first.gate.name}, which holds the earliest start (${first.work[0].name}, ${first.work[0].start}). Its pass condition: ${first.gate.criteria}.${first.gate.status === "failed" ? " It failed its last check: fix the cause and check it again, or change the plan." : ""}`,
      stop: "Check it once against the pass condition, then record passed, failed or waived with a note using marketing put gates. Do not start the held initiatives before then.",
      evidence: [],
      referenceIds: [],
    });
  }
  if (over.length) {
    const n = over.length,
      unknown = p.load.unknownHours.filter((id) => p.initiatives.find((i) => i.id === id).status !== "complete").map(name),
      finished = p.initiatives.some((i) => i.status === "complete" && i.hours > 0);
    actions.push({
      kind: "capacity",
      priority: 2,
      title: "Planned hours exceed the weekly cap",
      reason: `${n} week${n === 1 ? " exceeds" : "s exceed"} the ${project.weeklyHours} hour weekly cap: ${over.slice(0, 3).map((x) => `${x.start} (${x.hours} h, ${x.overBy} over)`).join(", ")}${n > 3 ? `, and ${n - 3} more` : ""}.${finished ? " Completed initiatives are not counted." : ""}${unknown.length ? ` Initiatives without hours are not counted: ${unknown.join(", ")}.` : ""}`,
      next: `Move work out of the heaviest week, shorten or drop an initiative, or ask the owner to raise the cap. Then run marketing plan ${project.id} again.`,
      stop: "Do not add an initiative to a week that is already over the cap.",
      evidence: [],
      referenceIds: [],
    });
  }
  return actions;
}
export function advise(w, projectId, filter = {}) {
  const project = w.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project does not exist");
  const r = report(w, { ...filter, projectId }),
    p = plan(w, projectId),
    actions = [];
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
  const unfinished = w.initiatives.filter((i) => i.projectId === projectId && i.status !== "complete");
  actions.push(
    ...planActions(
      project,
      p,
      (unfinished.length === p.initiatives.length ? p.load.weeks : weeklyLoad(project.weeklyHours, unfinished)).filter(
        (x) => x.overCap,
      ),
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
