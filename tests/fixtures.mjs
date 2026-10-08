export const project = {
  id: "game",
  name: "Orbit Garden",
  audience: ["players"],
  category: "game",
  problem: "A relaxing five-minute break",
  promise: "Grow a tiny planet",
  stage: "prototype",
  objective: "20 returning players",
  weeklyHours: 3,
  budget: 300,
  currency: "USD",
};
export const initiative = {
  id: "video",
  projectId: "game",
  name: "Playable clip",
  channel: "youtube",
  hypothesis: "A short play clip brings people who return",
  cta: "Play a round",
  status: "running",
  start: "2026-10-01",
  end: "2026-10-14",
  budget: 0,
  owner: "Family studio",
};
export function observation(id, metric, value, extra = {}) {
  return {
    id,
    projectId: "game",
    initiativeId: "video",
    channel: "youtube",
    metric,
    value,
    start: "2026-10-01",
    end: "2026-10-07",
    kind: "period",
    definition: metric,
    url: "https://example.com/analytics",
    collectedAt: "2026-10-08T12:00:00Z",
    ...extra,
  };
}
export function ledger() {
  return {
    schema: "marketing/workspace@1",
    revision: 0,
    projects: [project],
    initiatives: [initiative],
    observations: [],
    reactions: [],
    competitors: [],
    experiments: [],
    evidence: [],
    sources: [],
  };
}
