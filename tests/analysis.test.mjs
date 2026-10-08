import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wilson, analyzeExperiment, report, advise, sentimentSuggestion } from '../src/analysis.mjs';
import { ledger, observation } from './fixtures.mjs';
test('Wilson handles zero observations honestly and matches known binomial bounds', () => {
  assert.equal(wilson(0, 0), null); const ci = wilson(50,100); assert.ok(Math.abs(ci.low - 0.4038) < 0.001); assert.ok(Math.abs(ci.high - 0.5962) < 0.001);
  assert.throws(() => wilson(11,10));
});
test('small experiment stays inconclusive and stop rules are enforced', () => {
  const x = { targetPerArm: 100, randomized: true, arms: [{name:'A',trials:10,successes:1},{name:'B',trials:10,successes:2}] };
  assert.equal(analyzeExperiment(x).decision, 'collect');
  x.arms = [{name:'A',trials:100,successes:1},{name:'B',trials:100,successes:60}]; assert.equal(analyzeExperiment(x).decision, 'review-winner');
  x.randomized = false; assert.equal(analyzeExperiment(x).decision, 'observational');
});
test('report keeps incompatible definitions apart, replaces cumulative snapshots, and does not invent reach', () => {
  const w=ledger(); w.observations=[observation('old','views',10,{kind:'snapshot',series:'yt',end:'2026-10-05'}),observation('new','views',20,{kind:'snapshot',series:'yt'}),observation('engaged','views',4,{definition:'engaged views'})];
  const r=report(w,{projectId:'game'}); assert.equal(r.totals.length,2); assert.equal(r.totals.find(t=>t.definition==='views').value,20); assert.equal(r.uniqueReach,null);
});
test('a report retains the full snapshot history for trend charts',()=>{
 const w=ledger();w.observations=[observation('old','stars',10,{kind:'snapshot',series:'repo',end:'2026-10-05'}),observation('new','stars',20,{kind:'snapshot',series:'repo'})];const r=report(w);assert.equal(r.observations.length,2);assert.equal(r.totals[0].value,20);
});
test('overlapping periods are flagged instead of summed and incompatible funnel windows lack rates', () => {
  const w=ledger(); w.observations=[observation('a','visitors',100),observation('b','visitors',150,{start:'2026-10-05',end:'2026-10-08'}),observation('start','starts',8,{start:'2026-10-06',end:'2026-10-07'})];
  const r=report(w); assert.ok(r.warnings.some(x=>/overlap/i.test(x))); assert.equal(r.totals.find(t=>t.metric==='visitors').value,null); assert.equal(r.funnels[0].rate,null);
});
test('advice connects activation gap to evidence without declaring market viability from likes', () => {
  const w=ledger(); w.observations=[observation('v','visitors',90),observation('s','starts',8),observation('r','returns',1)];
  const a=advise(w,'game'); assert.ok(a.some(x=>x.kind==='activation' && x.evidence.includes('v'))); assert.ok(a.some(x=>x.kind==='viability'));
});
test('sentiment suggestion is unreviewed and detects ambiguous mixed wording', () => { assert.equal(sentimentSuggestion('Great art but terrible controls').label,'mixed'); assert.equal(sentimentSuggestion('I love it').reviewed,false); assert.equal(sentimentSuggestion('It is a game').label,'unknown'); });
