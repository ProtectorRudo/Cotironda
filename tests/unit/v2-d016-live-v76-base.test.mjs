import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {
 D016_LIVE_V76_INDEX_SHA256,verificarBaseWhapiV76,verificarBundleWhapiV76
} from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';

const root=resolve(import.meta.dirname,'../..');
const generator=resolve(root,'scripts/piloto/v2-d016-whapi-overlay.mjs');
const oldSource=resolve(root,'supabase/functions/cotironda-piloto-whapi/index.ts');
const liveCandidate=resolve(root,
 'supabase/functions/cotironda-piloto-whapi/index.v2-d016-live-v76-candidate.ts');

test('D016: SHA-256 de index.ts LIVE v76 se exige; GitHub no es su reemplazo',()=>{
 assert.match(D016_LIVE_V76_INDEX_SHA256,/^[0-9a-f]{64}$/u);
 assert.equal(D016_LIVE_V76_INDEX_SHA256,
  '349831d3be81d0da95ba0cc3b699256521e35d4b7c0f1923e3dc2a6a714d0c7d');
 const gh=readFileSync(oldSource,'utf8');
 assert.notEqual(createHash('sha256').update(gh).digest('hex'),
  D016_LIVE_V76_INDEX_SHA256);
 assert.throws(()=>verificarBaseWhapiV76(gh),/d016_live_v76_input_sha_mismatch/u);
 assert.throws(()=>verificarBaseWhapiV76(gh+'\n'),/d016_live_v76_input_sha_mismatch/u);
 assert.throws(()=>verificarBaseWhapiV76(''),/d016_live_v76_input_sha_mismatch/u);
});

test('D016: no publicar ni generar candidato live sin fuente real',()=>{
 const r=spawnSync(process.execPath,[generator,'--write-live-v76-candidate'],{
  cwd:root,encoding:'utf8',timeout:20000
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/d016_live_v76_source_required/u);
 assert.equal(existsSync(liveCandidate),false);
});

test('D016: base GitHub antigua no puede pasar como Edge v76',()=>{
 const r=spawnSync(process.execPath,
  [generator,'--live-v76-source',oldSource,'--write-live-v76-candidate'],{
   cwd:root,encoding:'utf8',timeout:20000
  });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/d016_live_v76_input_sha_mismatch/u);
 assert.equal(existsSync(liveCandidate),false);
});

test('D016: no mezclar el modo de CI con la fuente real v76',()=>{
 const r=spawnSync(process.execPath,
  [generator,'--live-v76-source',oldSource,'--write-candidate'],{
   cwd:root,encoding:'utf8',timeout:20000
  });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/d016_live_v76_wrong_candidate_output/u);
 assert.equal(existsSync(liveCandidate),false);
});

test('D016: snapshot verificable de los 61 archivos LIVE v76, sin secretos',()=>{
 const m=JSON.parse(readFileSync(resolve(root,
  'scripts/piloto/v2-d016-whapi-live-v76-bundle-manifest.json'),'utf8'));
 assert.equal(m.kind,'cotironda_d016_live_whapi_v76_bundle_fingerprint');
 assert.equal(m.project_ref,'ilggkalaafhtiysyzlmg');
 assert.equal(m.edge_version,76);
 assert.equal(m.verify_jwt,false);
 assert.equal(m.deployment_authorized,false);
 assert.equal(m.file_count,61);
 assert.equal(m.files.length,61);
 assert.equal(new Set(m.files.map(x=>x.path)).size,61);
 assert.ok(m.files.every(x=>/^[a-f0-9]{64}$/u.test(x.sha256)));
 assert.equal(m.files.find(x=>x.path===
  'supabase/functions/cotironda-piloto-whapi/index.ts')?.sha256,
  D016_LIVE_V76_INDEX_SHA256);
 // CI usa fuente histórica GitHub; los 61 módulos NO pasan como snapshot real.
 assert.throws(()=>verificarBundleWhapiV76(root),
  /d016_live_v76_bundle_hash_mismatch/u);
});

test('D016: validación integral niega snapshot vacío o fuente ausente',()=>{
 assert.throws(()=>verificarBundleWhapiV76(''),
  /d016_live_v76_snapshot_root_required/u);
 assert.throws(()=>verificarBundleWhapiV76('/ruta-inexistente-cotironda-20261114'),
  /ENOENT/u);
});
