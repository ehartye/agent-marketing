export function wilson(successes,trials) {
  if(!Number.isSafeInteger(trials)||!Number.isSafeInteger(successes)||successes<0||trials<successes) throw new Error('Expected 0 <= integer successes <= integer trials');
  if(!trials) return null; const z=1.959963984540054, p=successes/trials, d=1+z*z/trials, center=(p+z*z/(2*trials))/d, half=z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/d;
  return {rate:p,low:Math.max(0,center-half),high:Math.min(1,center+half),trials,successes};
}
export function analyzeExperiment(x) {
  const arms=x.arms.map(a=>({name:a.name,interval:wilson(a.successes,a.trials)}));
  const [a,b]=arms.map(r=>r.interval), difference=a&&b?{low:b.low-a.high,high:b.high-a.low,estimate:b.rate-a.rate}:null;
  const ready=x.arms.every(a=>a.trials>=x.targetPerArm);
  const decision=!x.randomized?'observational':!ready?'collect':difference&&(difference.low>0||difference.high<0)?'review-winner':'inconclusive';
  return {id:x.id,name:x.name,arms,difference,decision,ready,stoppingRule:x.stoppingRule,caveat:'Conservative interval from separate Wilson bounds, not a calibrated hypothesis test. Prespecify duration, allocation and stopping; no causal winner from nonrandom groups or repeated peeking.'};
}
function groupKey(o) { return JSON.stringify([o.projectId,o.initiativeId||'',o.channel,o.metric,o.definition,o.currency||'',o.cohort||'']); }
export function report(w,filter={}) {
  const belongs=r=>(!filter.projectId||r.projectId===filter.projectId)&&(!filter.initiativeId||r.initiativeId===filter.initiativeId);
  const rows=w.observations.filter(o=>belongs(o)&&(!filter.from||o.start>=filter.from)&&(!filter.to||o.end<=filter.to));
  const warnings=[]; if(filter.from||filter.to) warnings.push('Only observations fully contained in the date filter are included; period totals cannot be prorated.');
  const grouped=new Map(); for(const o of rows) { const key=groupKey(o); if(!grouped.has(key)) grouped.set(key,[]); grouped.get(key).push(o); }
  const totals=[]; const selected=[];
  for(const group of grouped.values()) {
    const snapshots=new Map(); let periods=group.filter(o=>o.kind==='period');
    for(const o of group.filter(o=>o.kind==='snapshot')) { const old=snapshots.get(o.series); if(!old||o.end>old.end||(o.end===old.end&&o.collectedAt>old.collectedAt)) snapshots.set(o.series,o); }
    const used=[...periods,...snapshots.values()]; selected.push(...used); periods=periods.toSorted((a,b)=>a.start.localeCompare(b.start));
    const overlaps=periods.some((o,i)=>i&&o.start<=periods[i-1].end);
    const mixed=periods.length&&snapshots.size;
    if(overlaps||mixed) warnings.push(`${group[0].metric} on ${group[0].channel}: ${overlaps?'overlapping periods':'period and cumulative snapshot readings'}; inspect sources before adding.`);
    const first=group[0]; totals.push({...Object.fromEntries(['projectId','initiativeId','channel','metric','definition','currency','cohort'].map(k=>[k,first[k]])),value:overlaps||mixed?null:used.reduce((n,o)=>n+o.value,0),evidence:used.map(o=>o.id),periods:used.map(o=>({start:o.start,end:o.end,kind:o.kind})),ambiguous:!!(overlaps||mixed)});
  }
  const funnels=[];
  for(const t of totals.filter(t=>t.metric==='visitors'&&t.definition==='visitors')) {
    const s=totals.find(s=>s.projectId===t.projectId&&s.initiativeId===t.initiativeId&&s.channel===t.channel&&s.metric==='starts'&&s.definition==='starts'&&s.cohort===t.cohort);
    const sameWindow=s&&JSON.stringify(s.periods)===JSON.stringify(t.periods);
    const rate=sameWindow&&t.value>0&&s.value!==null&&s.value<=t.value?s.value/t.value:null;
    funnels.push({channel:t.channel,initiativeId:t.initiativeId,visitors:t.value,starts:s?.value??null,rate,evidence:[...t.evidence,...s?.evidence||[]],interpretation:rate===null?'No compatible denominator':t.cohort?'Cohort conversion':'Observed ratio; counts may represent different people'});
  }
  const reactions=w.reactions.filter(r=>belongs(r)&&(!filter.from||r.collectedAt.slice(0,10)>=filter.from)&&(!filter.to||r.collectedAt.slice(0,10)<=filter.to));
  const sentiment={positive:0,negative:0,neutral:0,mixed:0,unknown:0,unreviewed:0}; for(const r of reactions) { if(!r.reviewed) sentiment.unreviewed++; else sentiment[r.sentiment]++; }
  const experiments=w.experiments.filter(belongs).map(analyzeExperiment);
  return {filter,uniqueReach:null,totals,observations:rows,reactions,sentiment,funnels,experiments,competitors:w.competitors.filter(belongs),evidence:w.evidence.filter(belongs),sources:w.sources.filter(belongs),warnings:[...warnings,'Platform audiences overlap. Unique reach and causal attribution are not inferred.','Reactions are a self-selected sample; sentiment describes reviewed captured reactions only.']};
}
export function advise(w,projectId) {
  const project=w.projects.find(p=>p.id===projectId); if(!project) throw new Error('Project does not exist'); const r=report(w,{projectId}), actions=[];
  for(const f of r.funnels) if(f.rate!==null&&f.rate<0.2) actions.push({kind:'activation',priority:1,title:'Learn why visitors do not start',reason:`${f.starts} starts / ${f.visitors} visitors (${Math.round(f.rate*100)}% observed ratio) on ${f.channel}. The 20% trigger is a house heuristic, not a benchmark.`,next:'Observe three intended users trying the first session. Change one friction point, then measure the same attributed cohort.',stop:'Stop after three sessions or two hours; record whether the same obstacle repeats.',evidence:f.evidence,referenceIds:['experimentation','measurement']});
  const gaps=['problem','activation','retention','payment'].filter(d=>!w.evidence.some(e=>e.projectId===projectId&&e.dimension===d&&e.strength==='primary'&&e.result==='supports'));
  actions.push({kind:'viability',priority:2,title:gaps.length?'Collect missing viability evidence':'Review viability evidence',reason:gaps.length?`Missing primary support: ${gaps.join(', ')}. Views and favorable reactions do not fill these gaps.`:'All four dimensions have supporting records; inspect samples, contradictions and dates before committing money.',next:project.category==='game'?'Measure second-session return in a defined player cohort and ask intended players what would make them come back.':'Interview intended users about a recent instance of the problem; test activation, repeat use and an honest price offer.',stop:`Keep the next test within ${project.weeklyHours} hours and ${project.budget} ${project.currency}; decide the success criterion before running.`,evidence:w.evidence.filter(e=>e.projectId===projectId).map(e=>e.id),referenceIds:['discovery','experimentation','measurement']});
  const negatives=r.reactions.filter(x=>x.reviewed&&['negative','mixed'].includes(x.sentiment)); if(negatives.length) actions.push({kind:'reception',priority:1,title:'Investigate repeated objections',reason:`${negatives.length} reviewed mixed/negative reactions in the captured sample.`,next:'Group by theme, read the source context, distinguish usability from positioning and ask permission before quoting private feedback.',stop:'Review up to five source threads; choose one objection to test.',evidence:negatives.map(x=>x.id),referenceIds:['sentiment']});
  if(!w.initiatives.some(x=>x.projectId===projectId&&x.status==='running')) actions.push({kind:'channel',priority:3,title:'Run one focused channel test',reason:'No running initiative is recorded.',next:'Choose the channel where the intended audience already discusses this problem. Write a native contribution with a single measurable CTA.',stop:'Prespecify a seven-day window and an effort cap; record visits, activation and reaction context.',evidence:[],referenceIds:['channels']});
  return actions.toSorted((a,b)=>a.priority-b.priority);
}
export function sentimentSuggestion(text) {
  const words=text.toLowerCase(), positive=/\b(love|great|excellent|useful|beautiful|fun|helpful)\b/.test(words), negative=/\b(hate|terrible|broken|bad|confusing|boring|frustrating)\b/.test(words);
  return {label:positive&&negative?'mixed':/\b(not|never|sarcasm|yeah right)\b/.test(words)?'unknown':positive?'positive':negative?'negative':'unknown',reviewed:false,method:'Small English keyword heuristic; review negation, sarcasm, context and other languages manually.'};
}
