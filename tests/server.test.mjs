import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createWorkspace,readWorkspace} from '../src/store.mjs';
import {startServer} from '../src/server.mjs';
import {ledger} from './fixtures.mjs';
test('UI shares ledger, detects stale edits, rejects foreign origins, and exports persisted data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'marketing-ui-')),file=join(dir,'w.json');createWorkspace(file,ledger());let running;
 try {running=await startServer(file,{port:0});const base=running.url;let r=await fetch(base+'/api/workspace');assert.equal(r.status,200);const w=await r.json();assert.equal(w.projects[0].name,'Orbit Garden');
 const record={...w.initiatives[0],status:'paused'};const edit=()=>fetch(base+'/api/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'initiatives',record,revision:w.revision})});
 assert.equal((await edit()).status,200);assert.equal(readWorkspace(file).initiatives[0].status,'paused');assert.equal((await edit()).status,409);
 assert.equal((await fetch(base+'/api/workspace',{headers:{Origin:'https://evil.example'}})).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{const req=request(base+'/api/workspace',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(foreignHostStatus,403);
 const exported=await (await fetch(base+'/api/export?format=json')).json();assert.equal(exported.initiatives[0].status,'paused');
 assert.match(await (await fetch(base)).text(),/Campaign desk/);
 } finally {if(running)await new Promise(resolve=>running.server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
