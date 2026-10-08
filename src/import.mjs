export function parseImport(body,format='json') {
  if(format==='json') return JSON.parse(body);
  if(format!=='csv') throw new Error('Import format must be json or csv');
  body=body.replace(/^\uFEFF/,''); const rows=[]; let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<body.length;i++) { const c=body[i];
    if(quoted) { if(c==='"') { if(body[i+1]==='"') {value+='"';i++;} else {quoted=false;closed=true;} } else value+=c; }
    else if(c==='"'&&!value&&!closed) quoted=true;
    else if(c===','||c==='\n'||c==='\r') { row.push(value);value='';closed=false; if(c!==',') { if(c==='\r'&&body[i+1]==='\n') i++; if(row.some(x=>x!=='')) rows.push(row);row=[]; } }
    else { if(c==='"'||closed) throw new Error('Malformed CSV quote'); value+=c; }
  }
  if(quoted) throw new Error('Unclosed CSV quote'); if(value||row.length||closed) {row.push(value);rows.push(row);} const headers=rows.shift();
  if(!headers?.length) throw new Error('CSV has no headers'); if(new Set(headers).size!==headers.length) throw new Error('Duplicate CSV header');
  return {observations:rows.map((r,i)=>{ if(r.length!==headers.length) throw new Error(`CSV row ${i+2}: column count differs from header`); const o=Object.fromEntries(headers.map((h,j)=>[h,r[j]]).filter(([,v])=>v!=='')); if(o.value!==undefined) o.value=Number(o.value); return o; })};
}
export function taggedUrl(base,tags) {
  const u=new URL(base); if(!['http:','https:'].includes(u.protocol)) throw new Error('Expected http(s) destination');
  for(const k of ['source','medium','campaign']) if(typeof tags[k]!=='string'||!tags[k].trim()) throw new Error(`UTM ${k} required`);
  for(const [k,v] of Object.entries(tags)) { if(!['source','medium','campaign','content','term'].includes(k)) throw new Error(`Unknown UTM ${k}`); if(v) u.searchParams.set(`utm_${k}`,v.trim().toLowerCase().replace(/\s+/g,'-')); } return u.href;
}
export function observationsCsv(rows) {
  const headers=['id','projectId','initiativeId','channel','metric','value','start','end','kind','definition','url','collectedAt','series','currency','cohort'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"'; return [headers.join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\r\n')+'\r\n';
}
