import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ledger,observation} from './fixtures.mjs';
test('CLI initializes, imports, reports, advises, and rejects unknown commands',()=>{
 const dir=mkdtempSync(join(tmpdir(),'marketing-cli-')),file=join(dir,'w.json'); const run=(...args)=>spawnSync(process.execPath,[resolve('scripts/marketing.mjs'),...args,'--workspace',file],{encoding:'utf8'});
 try { let r=run('init'); assert.equal(r.status,0,r.stderr);const input=join(dir,'import.json');const w=ledger();writeFileSync(input,JSON.stringify({projects:w.projects,initiatives:w.initiatives,observations:[observation('v','visitors',90),observation('s','starts',8)]}));
  r=run('import',input);assert.equal(r.status,0,r.stderr);r=run('report','--project','game');assert.equal(JSON.parse(r.stdout).totals.length,2);
  r=run('advise','game');assert.ok(JSON.parse(r.stdout).some(x=>x.kind==='activation'));assert.equal(run('typo').status,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('demo is a complete validated portfolio with research, reception and experiments',()=>{
 const dir=mkdtempSync(join(tmpdir(),'marketing-demo-')),file=join(dir,'demo.json');
 try{const r=spawnSync(process.execPath,[resolve('scripts/marketing.mjs'),'demo','--workspace',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const w=JSON.parse(r.stdout);assert.ok(w.projects.length>=2);assert.ok(w.reactions.length>=5);assert.ok(w.competitors.length>=2);assert.ok(w.experiments.length>=2);}finally{rmSync(dir,{recursive:true,force:true});}
});
