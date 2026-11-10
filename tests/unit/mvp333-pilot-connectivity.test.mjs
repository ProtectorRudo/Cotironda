import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 esPruebaDeConexionMvp333,prepararCandidatoMvp333
} from '../../scripts/piloto/mvp333-connection-check-candidate.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SRC=resolve(ROOT,'supabase/functions/cotironda-piloto-whapi/index.ts');
const MANIFEST=resolve(ROOT,'scripts/piloto/mvp332-whapi-v70-bundle-manifest.json');
const SCRIPT=resolve(ROOT,'scripts/piloto/mvp333-connection-check-candidate.mjs');
const baseline=readFileSync(SRC,'utf8');
const manifest=JSON.parse(readFileSync(MANIFEST,'utf8'));
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');

test('MVP333: recognizes exact signed-architect connectivity test',()=>{
 for(const phrase of [
  'Hola Cotironda, prueba de conexión del piloto.',
  'HOLA COTIRONDA, PRUEBA DE CONEXION DEL PILOTO!',
  ' hola cotironda,   prueba de conexion del piloto  '
 ]) assert.equal(esPruebaDeConexionMvp333(phrase),true,phrase);
});
test('MVP333: greetings and normal free-language requests still reach IA Central',()=>{
 for(const phrase of [
  'Hola Cotironda',
  'Buenas, necesito cemento',
  '1 m³ arena y 20 bolsas de CPC 50 kg para La Plata',
  'Hola Cotironda, prueba de conexión del piloto. Además 20 bolsas CPC',
  'Hola Cotironda, necesito 20 bolsas de cemento',
  'Prueba de conexión del piloto con 10 bolsas de cemento',
  '',
  null,
  {body:'Hola Cotironda, prueba de conexión del piloto.'}
 ]) assert.equal(esPruebaDeConexionMvp333(phrase),false,String(phrase));
});
test('MVP333: archived MVP332 baseline remains immutable',()=>{
 const candidate=prepararCandidatoMvp333();
 assert.equal(sha(baseline),'8fe87052a6bb100ddf4b22ddf3c0ae5fb467b3d386035fd514ea44e7a83e77e2');
 assert.equal(manifest.files.find(x=>x.path===manifest.entrypoint).candidate_sha256,sha(baseline));
 assert.equal(sha(readFileSync(SRC,'utf8')),sha(baseline));
 assert.notEqual(candidate.candidate_sha256,sha(baseline));
 assert.equal(sha(candidate.source),candidate.candidate_sha256);
 assert.equal(candidate.file_count,61);
 assert.equal(candidate.project_ref,'ilggkalaafhtiysyzlmg');
 assert.equal(candidate.deployment_authorized,false);
 assert.equal(candidate.messages_sent,0);
 assert.equal(candidate.database_mutated,false);
 assert.equal(candidate.openai_calls,0);
});
test('MVP333: does not alter existing modules or imports',()=>{
 const {source}=prepararCandidatoMvp333();
 const imports=s=>s.split('\n').filter(l=>l.startsWith('import '));
 assert.deepEqual(imports(source),imports(baseline));
 assert.equal(source.split('\n').length,baseline.split('\n').length+12);
});
test('MVP333: test is strictly buyer, known channel, no supplier and exact message',()=>{
 const {source}=prepararCandidatoMvp333();
 assert.match(source,/connectivityOnlyMvp333=centralConfigured&&row\.type==='text'/u);
 assert.match(source,/!supplierKnown&&!centralSupplier&&!webLinkCode&&/u);
 assert.match(source,/!buyerReviewCommand&&!buyerLinkCommand&&/u);
 const n=(source.match(/connectivityOnlyMvp333/gu)??[]).length;
 assert.equal(n,4);
});
test('MVP333: no legacy classifier or IA Central call for the test',()=>{
 const {source}=prepararCandidatoMvp333();
 assert.match(source,/!webLinkCode&&!centralBuyerText&&\s*!buyerReviewCommand&&!buyerLinkCommand&&!connectivityOnlyMvp333&&/u);
 assert.match(source,/!buyerReviewCommand&&!buyerLinkCommand&&!connectivityOnlyMvp333;/u);
 assert.match(source,/if\(connectivityOnlyMvp333\)continue;/u);
});
test('MVP333: the inbox is archived BEFORE skipping false review',()=>{
 const {source}=prepararCandidatoMvp333();
 const stored=source.indexOf("const out=await db.rpc('cotironda_piloto_receive_whapi_v1'");
 const check=source.indexOf('if(connectivityOnlyMvp333)continue;');
 const central=source.indexOf('if(centralBuyerText&&!handledCentralZoneReply');
 assert(stored>0);
 assert(check>stored);
 assert(central>check);
});
test('MVP333: a pure check does not wake background supplier dispatch',()=>{
 const {source}=prepararCandidatoMvp333();
 const seen=source.indexOf('processedInboundMvp333++');
 const check=source.indexOf('connectivityCountMvp333++;continue;');
 const stop=source.indexOf("return json(200,'connectivity_check_recorded')");
 const dispatch=source.indexOf('try{await dispatchTwo(sec,db)}');
 assert(seen>0);
 assert(check>seen);
 assert(stop>check);
 assert(dispatch>stop);
 assert.match(source,/processedInboundMvp333>0&&connectivityCountMvp333===processedInboundMvp333/u);
});
test('MVP333: a mixed batch retains business dispatch and supplier replies',()=>{
 const {source}=prepararCandidatoMvp333();
 const count=(source.match(/processedInboundMvp333\+\+/gu)??[]).length;
 assert.equal(count,1);
 assert.match(source,/if\(connectivityOnlyMvp333\)\{connectivityCountMvp333\+\+;continue;\}/u);
 assert.match(source,/if\(processedInboundMvp333>0&&connectivityCountMvp333===processedInboundMvp333\)/u);
 assert.match(source,/try\{await dispatchTwo\(sec,db\)\}/u);
});
test('MVP333: no generic filtering of material descriptions',()=>{
 const {source}=prepararCandidatoMvp333();
 const testDecl=source.match(/const connectivityOnlyMvp333=[\s\S]*?\.test\(body\.trim\(\)\);/u)?.[0];
 assert(testDecl);
 assert(!/cemento|arena|hidrofugo|pintura|ladrillo|presupuesto|cotizar/u.test(testDecl));
 assert.match(testDecl,/^\s*const connectivityOnlyMvp333=/u);
});
test('MVP333: modified index refuses candidate preparation',()=>{
 assert.throws(()=>prepararCandidatoMvp333({source:baseline+'// tamper'}),
  /mvp333_immutable_mvp332_baseline_mismatch/u);
});
test('MVP333: altered source SHA in manifest refuses candidate preparation',()=>{
 const fake=structuredClone(manifest);
 fake.files.find(x=>x.path===fake.entrypoint).candidate_sha256='f'.repeat(64);
 assert.throws(()=>prepararCandidatoMvp333({manifest:fake}),
  /mvp333_immutable_mvp332_baseline_mismatch/u);
});
test('MVP333: CLI outputs only metadata, not the patched source or messages',()=>{
 const r=spawnSync(process.execPath,[SCRIPT],{encoding:'utf8',cwd:ROOT});
 assert.equal(r.status,0,r.stderr);
 const value=JSON.parse(r.stdout);
 assert.equal(value.state,'mvp333_candidate_only_not_deployed');
 assert.equal(value.deployment_authorized,false);
 assert(!('source' in value));
 assert(!r.stdout.includes('Bearer '));
 assert(!r.stdout.includes('gate.whapi.cloud'));
});
