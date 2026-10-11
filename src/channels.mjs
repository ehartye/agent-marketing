import { readFileSync } from "node:fs";
import { stageOf } from "./stages.mjs";
export const channelLibrary = JSON.parse(
  readFileSync(new URL("../library/channels.json", import.meta.url)),
);
export function recommendChannels(project) {
  const audience = project.audience.join(" ").toLowerCase(),
    stage = stageOf(project);
  return channelLibrary
    .map((c) => {
      const category = c.categories.includes(project.category),
        fit = c.audiences.some((a) => audience.includes(a)),
        available = c.hours <= project.weeklyHours,
        // The stages a card lists are those where its own approach can be carried out. A project
        // with no usable stage is scored on the first three terms alone.
        suits = stage && c.stages ? c.stages.includes(stage) : null,
        // A game tests on a venue that is free to enter before it pays a store fee.
        paidFirst = !!stage && stage !== "launched" && project.category === "game" && !!c.paidEntry;
      return {
        ...c,
        planningScore:
          (category ? 3 : 0) +
          (fit ? 2 : 0) +
          (available ? 1 : -2) +
          (suits === null ? 0 : suits ? 1 : -2) -
          (paidFirst ? 1 : 0),
        rationale: [
          category
            ? "Format suits the project category"
            : "Category fit needs evidence",
          fit
            ? "Audience description matches a channel cue"
            : "Verify that your intended people are present",
          available
            ? `Fits ${project.weeklyHours} hours/week`
            : `Needs about ${c.hours} hours/test; exceeds current weekly capacity`,
          ...(suits === null
            ? []
            : [
                suits
                  ? `Suits the ${stage} stage`
                  : `Needs a more finished project than the ${stage} stage; usually run from the ${c.stages[0]} stage on`,
              ]),
          ...(paidFirst
            ? [
                "Entry is paid (see cost): test a free web release first and open the page after its readiness gates pass",
              ]
            : []),
        ],
        // The rules behind the score terms that depend on the stage (craft/rules.json). The
        // category, audience and hours terms predate stages and cite none.
        ruleIds: [
          ...(suits === null ? [] : ["stage-sets-the-next-test"]),
          ...(paidFirst ? ["free-web-before-store-page", "store-page-after-gates"] : []),
        ],
        scoreMeaning:
          "House planning heuristic, not a reach or conversion forecast; verify policies when using the plan",
      };
    })
    .toSorted((a, b) => b.planningScore - a.planningScore);
}
