/**
 * MVP-002 / Issue #175: source integrity for DEV-only migration archive.
 * NEVER execute these files; the archive is NOT an executable migrations dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const entries=[
 ['20261030182413','dev_quality_once_only','39c5562965176a19866cd62848ffda09'],
 ['20261030190232','dev_quality_results_ledger','d6db42b33450881298f455846e2ec720'],
 ['20261030192011','dev_quality_auto_dispatch_d020','003c6e782d5f10d58d49c68149d990b5'],
 ['20261030192221','dev_quality_pg_net_nonpublic_d020','1146ae532daa4d86a03e4b52d8b59e7e'],
 ['20261030194856','dev_quality_numeric_diagnostics_d021','ded15f2f130f8de6bcdd9b06251c91ac']
];
test('DEV: cinco migraciones de laboratorio recuperadas con hashes exactos, nunca ejecutadas',()=>{
 for(const [version,name,expectedMd5] of entries){
   const path=new URL('../../docs/recovery-dev-20261030/'+version+'-'+name+'.md',
     import.meta.url);
   const content=readFileSync(path,'utf8');
   assert.match(content,/NO EJECUTAR/);
   assert.match(content,/Archivo forense/);
   const extracted=content.match(/\x60{3}sql\n([\s\S]*?)\n\x60{3}/);
   assert.ok(extracted,version);
   const sql=extracted[1];
   assert.equal(createHash('md5').update(sql,'utf8').digest('hex'),expectedMd5,
     'SQL recuperado del servidor DEV alterado: '+version);
   assert.doesNotMatch(sql,/\b(?:sk_live_|sb_secret_[a-zA-Z0-9_-]{16,}|-----BEGIN PRIVATE KEY-----)/);
 }
});
test('DEV: pg_net drop recuperado se mantiene solo como evidencia, no migration runnable',()=>{
 const file=readFileSync(
  new URL('../../docs/recovery-dev-20261030/20261030192221-dev_quality_pg_net_nonpublic_d020.md',
    import.meta.url),'utf8');
 assert.match(file,/DROP EXTENSION IF EXISTS pg_net/);
 assert.match(file,/NO EJECUTAR/);
});
