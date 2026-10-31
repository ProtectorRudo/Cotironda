import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepararD020InerteD038,generarEnsayoD038}
  from '../../scripts/ci/prepare-inert-quality-d038.mjs';
import {createHash} from 'node:crypto';

const SQL='supabase/recovery/dev_quality_20261030/20261030192011_dev_quality_auto_dispatch_d020.sql';
const MANIFEST='supabase/recovery/dev_quality_20261030/manifest.json';
const load=async()=>{
 const sql=await readFile(SQL,'utf8');
 const m=JSON.parse(await readFile(MANIFEST,'utf8'));
 return {sql,hash:m.migrations.find(x=>x.version==='20261030192011').sha256};
};

test('D038: solo omite las dos instalaciones de extensiones, mantiene lógica de D020',async()=>{
 const {sql,hash}=await load();
 const inert=prepararD020InerteD038(sql,hash);
 assert.equal(sql.includes('create extension if not exists pg_net;'),true);
 assert.equal(inert.includes('create extension if not exists pg_net;'),false);
 assert.equal(inert.includes('create extension if not exists pg_cron;'),false);
 assert.match(inert,/create or replace function cotironda_private\.dev_quality_dispatch_next\(\)/);
 assert.match(inert,/select net\.http_post\(/); // definición, pero flag OFF en PG17
 assert.match(inert,/if v_enabled is distinct from true then/);
 assert.match(inert,/return 'disabled';/);
 assert.match(inert,/enabled boolean not null default false/);
 assert.match(inert,/revoke all on cotironda_private\.dev_quality_auto_runs/);
 const diffs=sql.split('\n').filter(line=>line.startsWith('create extension if not exists'));
 assert.equal(diffs.length,2);
});
test('D038: el hash debe ser exacto; no se admite un SQL similar',async()=>{
 const {sql,hash}=await load();
 assert.equal(createHash('sha256').update(sql).digest('hex'),hash);
 assert.throws(()=>prepararD020InerteD038(sql.replace('default false','default true'),hash),
 /D038_ORIGINAL_HASH_MISMATCH/);
 assert.throws(()=>prepararD020InerteD038(sql,'0'.repeat(64)),
 /D038_ORIGINAL_HASH_MISMATCH/);
});
test('D038: si la migración agrega otras operaciones EXTENSION/cron falla cerrada',async()=>{
 const {sql}=await load();
 for(const mutated of [
  sql+"\nDROP EXTENSION IF EXISTS pg_net;",
  sql+"\nCREATE EXTENSION random_ext;",
  sql+"\nSELECT cron.schedule('job','* * * * *','select 1');",
  sql+"\nSELECT cotironda_private.dev_quality_dispatch_next();"
 ]){
  const hash=createHash('sha256').update(mutated).digest('hex');
  assert.throws(()=>prepararD020InerteD038(mutated,hash),/D038_UNSAFE_D020_SQL/);
 }
});
test('D038: ausencia de flag OFF o de doble encabezado se rechaza',async()=>{
 const {sql}=await load();
 for(const mutated of [
  sql.replace('enabled boolean not null default false','enabled boolean not null default true'),
  sql.replace('if v_enabled is distinct from true then','if false then'),
  sql.replace("return 'disabled';","return 'submitted';"),
  sql.replace('create extension if not exists pg_cron;','-- disabled extension declaration')
 ]){
  const hash=createHash('sha256').update(mutated).digest('hex');
  assert.throws(()=>prepararD020InerteD038(mutated,hash),/D038_/);
 }
});
test('D038: prohibido generar cualquier archivo fuera del job CI aislado',async()=>{
 const before=process.env.COTIRONDA_CI_INERT_RESTORE;
 const host=process.env.PGHOST;
 const database=process.env.PGDATABASE;
 try{
  delete process.env.COTIRONDA_CI_INERT_RESTORE;
  await assert.rejects(()=>generarEnsayoD038('/tmp/cotironda_d038_inert.sql'),/D038_CI_ONLY_GUARD/);
  process.env.COTIRONDA_CI_INERT_RESTORE='true';
  process.env.PGHOST='127.0.0.1';
  process.env.PGDATABASE='cotironda_ci';
  await assert.rejects(()=>generarEnsayoD038('/tmp/any-other-file.sql'),/D038_CI_ONLY_GUARD/);
  process.env.PGHOST='remote.supabase.co';
  await assert.rejects(()=>generarEnsayoD038('/tmp/cotironda_d038_inert.sql'),/D038_CI_ONLY_GUARD/);
 }finally{
  if(before===undefined)delete process.env.COTIRONDA_CI_INERT_RESTORE;
  else process.env.COTIRONDA_CI_INERT_RESTORE=before;
  if(host===undefined)delete process.env.PGHOST;
  else process.env.PGHOST=host;
  if(database===undefined)delete process.env.PGDATABASE;
  else process.env.PGDATABASE=database;
 }
});
