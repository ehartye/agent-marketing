import { mutateWorkspace, unchanged } from "./store.mjs";
import { actionStatuses, gateStatuses, updateKinds } from "./schema.mjs";
import { localDate } from "./analysis.mjs";

// The commands that record progress: decide, defer, move an action, check a gate, write a note.
// Each takes the workspace file, makes ONE locked write that also appends an `updates` entry, and
// returns { record, update, warnings, changed, revision }. `revision` in the options is the revision
// the caller last saw; without it the command applies to whatever is current. `now` (an ISO
// timestamp) and `today` (YYYY-MM-DD) are injectable so a test, or a caller that must agree with
// its own clock, controls every date written. Asking for what is already true writes nothing:
// `changed` is false, `update` is null and the revision does not move.

const missing = (noun, id) => Object.assign(new Error(`${noun} "${id}" does not exist`), { status: 404 });
const find = (w, collection, noun, id) => {
  const record = w[collection].find((r) => r.id === id);
  if (!record) throw missing(noun, id);
  return record;
};
const clock = ({ now, today } = {}) => {
  const at = now ?? new Date().toISOString();
  return { at, today: today ?? (now ? now.slice(0, 10) : localDate()) };
};

// Runs `edit` on the workspace under the lock. `edit` returns { record, update?, warnings? }, the
// update being the entry it appended, or `same(record)` when there was nothing to change.
function write(file, revision, edit) {
  let done;
  const w = mutateWorkspace(
    file,
    (w) => {
      done = edit(w);
      return done.untouched ? unchanged : undefined;
    },
    revision,
  );
  return done.untouched
    ? { record: done.untouched, changed: false, update: null, warnings: [], revision: w.revision }
    : { record: done.record, changed: true, update: done.update ?? null, warnings: done.warnings ?? [], revision: w.revision };
}
const same = (record) => ({ untouched: structuredClone(record) });

// Appends to the progress log. IDs are u-<timestamp in base 36>-<n>, with n the first free number,
// so two entries in the same millisecond stay distinct.
function log(w, { projectId, initiativeId, kind, refId, text, at }) {
  const stem = `u-${Date.parse(at).toString(36)}-`,
    taken = new Set(w.updates.map((u) => u.id));
  let n = 1;
  while (taken.has(stem + n)) n++;
  const update = { id: stem + n, projectId, at, kind, text };
  if (initiativeId) update.initiativeId = initiativeId;
  if (refId) update.refId = refId;
  w.updates.push(update);
  return update;
}
const label = (decision, id) => decision.options.find((o) => o.id === id)?.label ?? id;
const words = (list) => list.join(", ");

export function decide(file, decisionId, { optionId, rationale, change = false, revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    const d = find(w, "decisions", "Decision", decisionId);
    if (d.status === "superseded") throw new Error(`Decision "${d.id}" was superseded by ${d.supersededBy}; decide that one`);
    if (d.status === "decided" && !change)
      throw new Error(`Decision "${d.id}" is already decided (${label(d, d.chosen)}, ${d.decidedAt}); pass change to revise it`);
    if (!optionId) throw new Error(`Required: option (one of ${words(d.options.map((o) => o.id))})`);
    if (!d.options.some((o) => o.id === optionId))
      throw new Error(`"${optionId}" is not an option of decision "${d.id}" (${words(d.options.map((o) => o.id))})`);
    const was = d.status === "decided" ? { chosen: d.chosen, rationale: d.rationale, decidedAt: d.decidedAt } : null;
    if (was) {
      if (was.rationale === undefined) delete was.rationale;
      d.history = [...(d.history ?? []), was];
    }
    d.status = "decided";
    d.chosen = optionId;
    d.decidedAt = at;
    if (rationale) d.rationale = rationale;
    else delete d.rationale;
    const text = was
      ? `Changed "${d.title}" from ${label(d, was.chosen)} to ${label(d, optionId)}`
      : `Decided "${d.title}": ${label(d, optionId)}`;
    const update = log(w, {
      projectId: d.projectId,
      initiativeId: d.initiativeId,
      kind: "decision",
      refId: d.id,
      text: rationale ? `${text} (${rationale})` : text,
      at,
    });
    return { record: structuredClone(d), update };
  });
}

export function defer(file, decisionId, { until, note, revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    const d = find(w, "decisions", "Decision", decisionId);
    if (d.status === "decided") throw new Error(`Decision "${d.id}" is already decided; change it with decide instead`);
    if (d.status === "superseded") throw new Error(`Decision "${d.id}" was superseded by ${d.supersededBy}`);
    if (d.status === "deferred" && (until === undefined || until === d.needBy) && note === undefined) return same(d);
    d.status = "deferred";
    if (until !== undefined) d.needBy = until;
    const update = log(w, {
      projectId: d.projectId,
      initiativeId: d.initiativeId,
      kind: "decision",
      refId: d.id,
      text: `Deferred "${d.title}"${until ? ` until ${until}` : ""}${note ? `: ${note}` : ""}`,
      at,
    });
    return { record: structuredClone(d), update };
  });
}

export function setActionStatus(file, actionId, status, { notes, revision, ...time } = {}) {
  const { at } = clock(time);
  if (!actionStatuses.includes(status)) throw new Error(`Action status must be one of ${words(actionStatuses)}`);
  return write(file, revision, (w) => {
    const a = find(w, "actions", "Action", actionId);
    const field = status === "blocked" ? "blockedBy" : "notes";
    if (a.status === status && (notes === undefined || a[field] === notes)) return same(a);
    a.status = status;
    if (status === "done") a.doneAt = a.doneAt ?? at;
    else delete a.doneAt;
    if (status !== "blocked") delete a.blockedBy;
    if (notes !== undefined) a[field] = notes;
    const update = log(w, {
      projectId: a.projectId,
      initiativeId: a.initiativeId,
      kind: "action",
      refId: a.id,
      text: `Action "${a.title}" is ${status}${notes ? `: ${notes}` : ""}`,
      at,
    });
    return { record: structuredClone(a), update };
  });
}

// `due` and `hours` change the gate's deadline and maker-hours; a value of null clears one, and
// leaving one out keeps it.
export function setGate(file, gateId, { status, note, evidenceIds, due, hours, revision, ...time } = {}) {
  const { at, today } = clock(time);
  if (!gateStatuses.includes(status)) throw new Error(`Gate status must be one of ${words(gateStatuses)}`);
  return write(file, revision, (w) => {
    const g = find(w, "gates", "Gate", gateId);
    const sameEvidence = evidenceIds === undefined || JSON.stringify(evidenceIds) === JSON.stringify(g.evidenceIds ?? []);
    const sameField = (key, value) => value === undefined || (g[key] ?? null) === value;
    if (g.status === status && g.checkedAt === today && (note === undefined || g.notes === note) && sameEvidence && sameField("due", due) && sameField("hours", hours))
      return same(g);
    g.status = status;
    g.checkedAt = today;
    if (note !== undefined) g.notes = note;
    if (evidenceIds !== undefined) g.evidenceIds = evidenceIds;
    for (const [key, value] of Object.entries({ due, hours })) {
      if (value === null) delete g[key];
      else if (value !== undefined) g[key] = value;
    }
    // The same two checks plan() warns about; the gate is saved, and the caller is told.
    const warnings = [];
    if (status === "passed" && !g.evidenceIds?.length) warnings.push(`Gate "${g.id}" is passed but cites no evidence`);
    if (status === "waived" && !g.notes) warnings.push(`Gate "${g.id}" is waived without a note saying why`);
    const update = log(w, {
      projectId: g.projectId,
      initiativeId: g.initiativeId,
      kind: "gate",
      refId: g.id,
      text: `Gate "${g.name}" is now ${status}${note ? `: ${note}` : ""}`,
      at,
    });
    return { record: structuredClone(g), update, warnings };
  });
}

// A free note in the progress log. Its project is the initiative's, the one named, or the only one.
export function addUpdate(file, { text, kind = "note", initiativeId, refId, projectId, revision, ...time } = {}) {
  const { at } = clock(time);
  if (!updateKinds.includes(kind)) throw new Error(`Update kind must be one of ${words(updateKinds)}`);
  return write(file, revision, (w) => {
    if (initiativeId) projectId = find(w, "initiatives", "Initiative", initiativeId).projectId;
    else if (!projectId) {
      if (w.projects.length !== 1)
        throw new Error(`The workspace has several projects (${words(w.projects.map((p) => p.id))}); name one with a project or initiative`);
      projectId = w.projects[0].id;
    }
    const update = log(w, { projectId, initiativeId, kind, refId, text, at });
    return { record: structuredClone(update), update };
  });
}

// The one-line status the owner reads on an initiative. An empty note clears it.
export function setInitiativeNote(file, initiativeId, note, { revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    const i = find(w, "initiatives", "Initiative", initiativeId);
    if ((i.note ?? "") === (note ?? "")) return same(i);
    if (note) i.note = note;
    else delete i.note;
    const update = log(w, {
      projectId: i.projectId,
      initiativeId: i.id,
      kind: "initiative",
      refId: i.id,
      text: note ? `${i.name}: ${note}` : `Cleared the status note of ${i.name}`,
      at,
    });
    return { record: structuredClone(i), update };
  });
}

// A new action. Its project is the one named, or the project of the initiative, gate or decision
// it names, or the workspace's only project. An ID already in use is refused: this adds, it does
// not replace.
export function addAction(
  file,
  { id, title, owner = "owner", status = "todo", due, hours, notes, initiativeId, gateId, decisionId, projectId, revision, ...time } = {},
) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    if (!id) throw new Error("Required: id");
    if (w.actions.some((a) => a.id === id)) throw new Error(`Action "${id}" already exists; change it with action status`);
    const named = [
      initiativeId && find(w, "initiatives", "Initiative", initiativeId),
      gateId && find(w, "gates", "Gate", gateId),
      decisionId && find(w, "decisions", "Decision", decisionId),
    ].find(Boolean);
    projectId = projectId ?? named?.projectId;
    if (!projectId) {
      if (w.projects.length !== 1)
        throw new Error(`The workspace has several projects (${words(w.projects.map((p) => p.id))}); name one with a project`);
      projectId = w.projects[0].id;
    }
    const record = { id, projectId, title, owner, status };
    for (const [key, value] of Object.entries({ initiativeId, gateId, decisionId, due, hours, notes }))
      if (value !== undefined) record[key] = value;
    w.actions.push(record);
    const update = log(w, {
      projectId,
      initiativeId,
      kind: "action",
      refId: id,
      text: `Added ${owner === "agent" ? "agent " : ""}action "${title}"${due ? `, due ${due}` : ""}`,
      at,
    });
    return { record: structuredClone(record), update };
  });
}
