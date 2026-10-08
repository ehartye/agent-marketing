# Experiments and decisions

State the audience and unit, allocation, primary outcome, planned duration, sample target and stopping rule before collecting results. Randomize when feasible and keep a person in the same arm. A channel comparison with different audiences is observational, even if it has an A/B label.

The CLI calculates [Wilson intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) for two binomial arms. For zero trials it reports unknown. For B − A it displays conservative bounds formed from separate intervals. These bounds are not a calibrated 95% difference test, and the output does not prove statistical power. The sample target is set by the operator; the example value of 100 is illustrative, not a universal requirement.

`collect` means the target is not met. `observational` means assignment does not support causal interpretation. `inconclusive` means the bounds overlap zero at the recorded target. `review-winner` means a difference warrants reviewing the prespecified design, period, unit and stop conditions before acting; it is not automatic permission to scale spending. The free-text duration/stopping rule must be checked by the agent or owner, since the runtime cannot infer whether those conditions were satisfied.

At low traffic, a few observations can help find usability defects but rarely estimate a small conversion lift precisely. Report counts and intervals, not just percentages. Do not repeatedly peek and stop at a favorable reading while calling it a fixed-design result. Camuffo's [replication](https://doi.org/10.1002/smj.3580) supports testable entrepreneurial hypotheses and learning to stop; it does not promise that every test will find a winner.

An experiment memo ends with the decision, evidence, constraints and next observation: continue within the same cap, fix an identified obstacle, test a changed hypothesis, or stop the initiative. Keep negative results in the ledger. A new hypothesis deserves a new experiment ID rather than overwriting the failed one.
