// The stage playbook: what each project stage is for, and the advice that follows from it.
// A project is at one of four stages (schema.mjs). advise() and recommendChannels() read the stage
// here, and a project whose stage is missing or unrecognised gets the advice it got before stages
// were read. The ruleIds on each piece of advice name rules in craft/rules.json, where the
// provenance lives: the order of the stages is a house planning inference, and the game variations
// rest on documented store fees and rules.
export const stages = ["idea", "prototype", "beta", "launched"];
export const stageOf = (project) => (stages.includes(project?.stage) ? project.stage : null);
const isGame = (project) => project.category === "game";
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ratioText = (f) => `${f.starts} starts / ${f.visitors} visitors, ${pct(f.rate)}`;

// What each stage makes measurable, and which viability dimensions to close first. The list of
// missing dimensions in advise stays stage-independent (it is a fact about the ledger); this adds
// which of them the stage can act on.
const focus = {
  idea: {
    close: ["problem"],
    note: "nothing can be tried yet, so activation and retention cannot be observed; ask about the problem and what people use now.",
  },
  prototype: {
    close: ["activation", "problem"],
    note: "retention and payment wait until intended strangers have completed a first session.",
  },
  beta: {
    close: ["activation", "retention"],
    note: "widen only while the first session holds, and look for a returning cohort before asking for payment.",
  },
  launched: {
    close: ["retention", "payment"],
    note: "a cohort that returns says more than more visitors.",
  },
};
// The viability next step where a stage changes it. Beta, and every stage of a tool or app other
// than idea and launched, keeps the wording advise always used.
const viabilityNext = {
  game: {
    idea: "Show the promise (a paragraph and one image or a short capture, not a store page) to five intended players. Ask what they played last, why they stopped and what this would replace, and read the reviews of three close comparables for what players punish.",
    prototype:
      "Once strangers can start the build, measure second-session return in a defined player cohort and ask intended players what would make them come back.",
    launched:
      "Compare returns with starts for one cohort and window, and ask both returning and lapsed players what brought them back or stopped them.",
  },
  other: {
    idea: "Interview five intended users about the last time they met the problem and what they used instead; test the promise with a page or demo before building more.",
    launched:
      "Check whether a defined cohort of users returns and ask lapsed users why they stopped; test an honest price offer where payment evidence is missing.",
  },
};
// Stage-specific parts of the viability action, or null for a project with no usable stage.
export function viabilityGuide(project, gaps) {
  const stage = stageOf(project);
  if (!stage) return null;
  const { close, note } = focus[stage],
    first = close.filter((d) => gaps.includes(d)),
    promise = stage === "idea" && gaps.includes("problem");
  return {
    title: promise ? "Check the promise matters before building more" : null,
    priority: promise ? 1 : null,
    reason: `At the ${stage} stage ${note}${first.length ? ` Close ${first.join(" and ")} first.` : ""}`,
    next: viabilityNext[isGame(project) ? "game" : "other"][stage] ?? null,
    ruleIds: ["stage-sets-the-next-test", ...(stage === "idea" ? ["measure-what-can-occur"] : [])],
  };
}

// The channel action when nothing is running. An idea has nothing to send people to, so it listens;
// a game before launch starts where entry is free, which is the first move of free-web-before-store-page.
export function channelGuide(project) {
  const stage = stageOf(project);
  if (stage === "idea")
    return {
      title: "Listen where the audience already talks",
      reason: "No running initiative is recorded, and at the idea stage there is nothing to send people to.",
      next: `Find one community where intended people already talk about this, read what they ask for and why they stop, and note their words. Do not post a link${isGame(project) ? " or open a store page" : ""} yet.`,
      stop: "Stop after five threads or two hours.",
      referenceIds: ["channels", "discovery"],
      ruleIds: ["audience-before-channel", "stage-sets-the-next-test", "measure-what-can-occur"],
    };
  if (stage && isGame(project) && stage !== "launched")
    return {
      nextSuffix:
        " Start on a venue that is free to enter (an itch.io page, a web portal's own test); a paid store page waits for its readiness gates.",
      ruleIds: ["audience-before-channel", "stage-sets-the-next-test", "free-web-before-store-page"],
    };
  return stage ? { ruleIds: ["audience-before-channel", "stage-sets-the-next-test"] } : null;
}

function prototypeAction(project, r) {
  // Starts are the evidence that someone tried it; with any recorded, the funnel and the
  // activation action take over.
  if (r.totals.some((t) => t.metric === "starts")) return null;
  const game = isGame(project);
  return {
    kind: "stage",
    priority: 1,
    title: "Get intended strangers to a first session",
    reason:
      "The project is at the prototype stage and the ledger records no starts, so activation cannot be measured yet. Views, likes and favorable reactions do not show that anyone tried it.",
    next: game
      ? "Send five intended strangers one tagged link to the playable build on a venue that is free to start (an itch.io page, a web portal's own test or a community you already take part in) and watch each first session. Record visitors and starts with one definition and one window."
      : "Give five intended users the working build or demo and watch each try the first meaningful action. Record visitors and starts with one definition and one window.",
    stop: "Stop after five observed first sessions or two weeks, whichever comes first, and write down whether the same obstacle repeated before changing anything. These caps are house defaults.",
    evidence: [],
    referenceIds: ["discovery", "experimentation", "measurement"],
    ruleIds: ["stage-sets-the-next-test", "measure-what-can-occur", ...(game ? ["free-web-before-store-page"] : [])],
  };
}

function returnSentence(r) {
  const x = r.returnRates.find((y) => y.rate !== null);
  return x
    ? {
        text: `${x.returns} of ${x.starts} starts returned (${pct(x.rate)}) on ${x.channel}${x.cohort ? `, cohort ${x.cohort}` : ""}; returns are defined as "${x.returnsDefinition}".`,
        evidence: x.evidence,
      }
    : null;
}

function betaAction(project, r, p) {
  const ratios = r.funnels.filter((f) => f.rate !== null).toSorted((a, b) => b.rate - a.rate || b.starts - a.starts),
    back = returnSentence(r),
    game = isGame(project),
    reason = [],
    evidence = ratios.slice(0, 3).flatMap((f) => f.evidence);
  let next;
  if (!ratios.length) {
    reason.push("No channel has a comparable visitors-and-starts pair yet, so nothing yet favours one channel.");
    next =
      "Run one tagged test on a venue where the audience already is and record visitors and starts with one definition and one window; then widen.";
  } else if (ratios.length === 1) {
    reason.push(`${ratios[0].channel} is the only channel with a recorded ratio (${ratioText(ratios[0])}).`);
    next = "Fix the first-session obstacle it shows, then add one more channel and compare the same measure.";
  } else {
    const [best, ...rest] = ratios;
    reason.push(
      `${best.channel} has the highest observed ratio (${ratioText(best)}) against ${rest
        .slice(0, 2)
        .map((f) => `${f.channel} (${pct(f.rate)})`)
        .join(" and ")}; the groups are different audiences and the counts may be different people, so this is observational.`,
    );
    next = `Take the next test to ${best.channel} and keep ${rest[0].channel} as a comparison; fix the first-session obstacle before adding another channel.`;
  }
  if (back) {
    reason.push(back.text);
    evidence.push(...back.evidence);
  }
  if (game) {
    const open = p.gates.filter((g) => g.status === "open" || g.status === "failed");
    reason.push(
      !p.gates.length
        ? "No readiness gates are recorded for the store page."
        : open.length
          ? `Readiness gates not yet passed: ${open.map((g) => `${g.name} (${g.status})`).join(", ")}.`
          : "Every recorded readiness gate is passed or waived.",
    );
    next += ` Prefer a venue that is free to enter (an itch.io page, a web portal's own test) before a paid store page, and open a store page only after its readiness gates pass.${p.gates.length ? "" : " Record the gates first with marketing put gates."}`;
  }
  return {
    kind: "stage",
    priority: 2,
    title: "Widen through the best-evidenced channel",
    reason: reason.join(" "),
    next,
    stop: "Add one channel at a time, with a two-week window and the number that would make you stop written down first.",
    evidence,
    referenceIds: ["channels", "measurement", "experimentation", ...(game ? ["steam-direct"] : [])],
    ruleIds: [
      "stage-sets-the-next-test",
      "widen-by-observed-ratio",
      "audience-before-channel",
      ...(game ? ["free-web-before-store-page", "store-page-after-gates"] : []),
    ],
  };
}

function launchedAction(project, r) {
  const back = returnSentence(r),
    reviewed = r.reactions.filter((x) => x.reviewed),
    waiting = r.reactions.length - reviewed.length,
    how = back
      ? "Compare returns with starts for one cohort and window"
      : "Record starts and returns for one cohort and window (marketing report derives returnRates only when the cohort and window match)";
  return {
    kind: "stage",
    priority: 1,
    title: `Read who returns and what ${isGame(project) ? "players" : "users"} say`,
    reason: [
      back
        ? back.text
        : "No cohort return rate can be derived: the ledger holds no returns and starts for one cohort and window.",
      r.reactions.length
        ? `The captured sample has ${plural(reviewed.length, "reviewed reaction")} and ${waiting} not yet reviewed.`
        : "No reactions are captured yet.",
    ].join(" "),
    next: `${how}, group the reviewed objections by theme and fix the one that repeats before buying more reach. ${isGame(project) ? "Reply to store reviews and plan" : "Plan"} the next update on a cadence you can keep.`,
    stop: "Review weekly for four weeks; if the cohort return stays flat, change the product before adding reach.",
    evidence: [...(back?.evidence ?? []), ...reviewed.map((x) => x.id)],
    referenceIds: ["measurement", "sentiment", "experimentation"],
    ruleIds: ["stage-sets-the-next-test", "definitions-and-windows", "comments-are-a-sample"],
  };
}

// The action that names what this stage is for, or null where the viability and channel actions
// already carry it (an idea) or the ledger already holds what the action would ask for.
export function stageAction(project, r, p) {
  const stage = stageOf(project);
  if (stage === "prototype") return prototypeAction(project, r);
  if (stage === "beta") return betaAction(project, r, p);
  if (stage === "launched") return launchedAction(project, r);
  return null;
}
