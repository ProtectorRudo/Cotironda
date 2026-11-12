import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generarCandidatoV202DesdeLive76}
 from '../../scripts/piloto/v2-live76-candidate.mjs';
const root=new URL('../../',import.meta.url);
const load=path=>readFileSync(new URL(path,root),'utf8');
const v76=load('scripts/piloto/baselines/cotironda-whapi-v76.index.ts.txt');
const supplier=load('supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.v76-snapshot.ts');
const historical=load('supabase/functions/cotironda-piloto-whapi/index.ts');
test('preflight: Github index historico NO es exactamente Edge live v76',()=>{
 assert.notEqual(v76,historical);
 assert.ok(v76.includes("supplier-auto-correlation-mvp336.ts"));
 assert.ok(historical.includes("supplier-auto-correlation-mvp291.ts"));
 assert.ok(v76.includes('processedInboundMvp333'));
 assert.ok(!historical.includes('processedInboundMvp333'));
 assert.ok(v76.includes('webhookSecretState'));
});
test('preflight: V2 incorpora nuevos matches preservando MVP333 + M336 vivo',()=>{
 const candidate=generarCandidatoV202DesdeLive76(v76,supplier);
 for(const match of [
  'processedInboundMvp333','connectivityOnlyMvp333',
  'webhookSecretState','COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED',
  "db.rpc('cotironda_piloto_v2_quoted_id_for_reference'",
  "db.rpc('cotironda_piloto_v2_quoted_id_for_media_reference'",
  'supplier-auto-correlation-mvp336.v76-snapshot.ts',
  'ai-central-buyer-v2-d013.ts'
 ])assert.ok(candidate.includes(match),match);
 assert.ok(candidate.length>v76.length);
 assert.ok(!historical.includes('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED'));
 assert.ok(!candidate.includes("from './supplier-auto-correlation-mvp291.ts'"));
});
test('preflight: snapshots inmutables y no re-overlay accidentales',()=>{
 assert.throws(()=>generarCandidatoV202DesdeLive76(
  v76.replace("processedInboundMvp333","otherName"),supplier),
  /snapshot_integrity_mismatch/u);
 assert.throws(()=>generarCandidatoV202DesdeLive76(
  v76,supplier+'\n// cambio'),
  /snapshot_integrity_mismatch/u);
 const once=generarCandidatoV202DesdeLive76(v76,supplier);
 assert.throws(()=>generarCandidatoV202DesdeLive76(once,supplier),
  /snapshot_integrity_mismatch/u);
});
