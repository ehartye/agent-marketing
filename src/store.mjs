import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace, validateWorkspace, collections } from './schema.mjs';
function locked(file, action) {
  file=resolve(file); mkdirSync(dirname(file),{recursive:true}); const lock=`${file}.lock`;
  let fd;
  try { fd=openSync(lock,'wx'); } catch(e) { if(e.code==='EEXIST') throw new Error(`Workspace locked: ${lock}. Inspect its PID before removing a lock left by a stopped process.`); throw e; }
  try { writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()})); return action(file); }
  finally { closeSync(fd); unlinkSync(lock); }
}
function writeAtomic(file,w) {
  validateWorkspace(w); const temp=`${file}.${randomUUID()}.tmp`; let fd;
  try { fd=openSync(temp,'wx'); writeFileSync(fd,JSON.stringify(w,null,2)+'\n'); fsyncSync(fd); closeSync(fd); fd=undefined; renameSync(temp,file); }
  finally { if(fd!==undefined) closeSync(fd); if(existsSync(temp)) unlinkSync(temp); }
  return w;
}
export function createWorkspace(file,w=emptyWorkspace()) { return locked(file,path=>{ if(existsSync(path)) throw new Error('Workspace already exists'); return writeAtomic(path,w); }); }
export function readWorkspace(file) { return validateWorkspace(JSON.parse(readFileSync(file,'utf8'))); }
export function mutateWorkspace(file,action,expectedRevision) { return locked(file,path=>{ const w=readWorkspace(path); if(expectedRevision!==undefined&&w.revision!==expectedRevision) throw new Error(`Revision conflict: expected ${expectedRevision}, current ${w.revision}. Reload and reconcile your edit.`); action(w); w.revision++; return writeAtomic(path,w); }); }
export function importRecords(file,patch,expectedRevision) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch)) throw new Error('Import must be an object of collection arrays');
  for(const k of Object.keys(patch)) if(!collections.includes(k)) throw new Error(`Cannot import ${k}; import collection arrays only`);
  return mutateWorkspace(file,w=>{ for(const [k,rows] of Object.entries(patch)) {
    if(!Array.isArray(rows)) throw new Error(`${k}: expected array`);
    const incoming=new Set(); const merged=new Map(w[k].map(r=>[r.id,r]));
    for(const r of rows) { if(incoming.has(r.id)) throw new Error(`${k}: duplicate import ID ${r.id}`); incoming.add(r.id); merged.set(r.id,structuredClone(r)); } w[k]=[...merged.values()];
  } },expectedRevision);
}
