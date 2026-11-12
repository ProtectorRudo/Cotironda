/**
 * V2 preflight: armá un candidato desde el código REAL del Edge v76.
 * No reemplaza el index.ts histórico ni modifica Supabase/Whapi/Storage.
 * Snapshot exacto exportado de get_edge_function sin secretos, 12/11/26.
 * Para publicación posterior, REVALIDAR version+SHA y comparar TODAS
 * las dependencias con el bundle vivo de ese instante.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generarWebhookV202} from './v2-02-whapi-overlay.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../..');
const ENTRY=resolve(ROOT,'scripts/piloto/baselines/cotironda-whapi-v76.index.ts.txt');
const SUPPLIER=resolve(ROOT,'supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.v76-snapshot.ts');
const OUTPUT=resolve(ROOT,'supabase/functions/cotironda-piloto-whapi/index.v2-live76-candidate.ts');
const ENTRY_BLOB='916f3bed93628c6ea8019b55f348b369045ef0e2';
const SUPPLIER_BLOB='eb522a681eb53e2cf6ef62a7bf497114ebcdaf65';
function gitBlobSha(content){
 const data=Buffer.from(content,'utf8');
 return createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
}
function matchOne(s,a,b,what){
 const i=s.indexOf(a);
 if(i<0||s.indexOf(a,i+1)>=0)throw Error('live_v76_anchor_mismatch:'+what);
 return s.slice(0,i)+b+s.slice(i+a.length);
}
export function generarCandidatoV202DesdeLive76(index,supplier){
 if(gitBlobSha(index)!==ENTRY_BLOB||gitBlobSha(supplier)!==SUPPLIER_BLOB)
  throw Error('live_v76_snapshot_integrity_mismatch');
 // El snapshot v76 INCLUYE mejores chequeos de webhook, control MVP333
 // y el import M336 que el baseline inmóvil del repositorio no tiene.
 for(const marker of [
  'supplier-auto-correlation-mvp336.ts',
  'connectivityOnlyMvp333',
  'processedInboundMvp333',
  'webhookSecretState'
 ])if(!index.includes(marker))throw Error('live_v76_feature_missing:'+marker);
 let candidate=generarWebhookV202(index);
 const source="'./supplier-auto-correlation-mvp336.ts'";
 const pinned="'./supplier-auto-correlation-mvp336.v76-snapshot.ts'";
 candidate=matchOne(candidate,source,pinned,'supplier-m336');
 for(const marker of [
  'connectivityOnlyMvp333','processedInboundMvp333',
  'webhookSecretState','index.v2-live76-candidate.ts'
 ]){
  if(marker==='index.v2-live76-candidate.ts')continue;
  if(!candidate.includes(marker))throw Error('live_v76_feature_dropped:'+marker);
 }
 if(candidate.includes("from './supplier-auto-correlation-mvp291.ts'"))
  throw Error('live_v76_reverted_supplier_correlation');
 return candidate;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const candidate=generarCandidatoV202DesdeLive76(
   readFileSync(ENTRY,'utf8'),readFileSync(SUPPLIER,'utf8'));
  if(process.argv.includes('--write-candidate')){
   writeFileSync(OUTPUT,candidate,'utf8');
   process.stdout.write('LIVE_V76_CANDIDATE_GENERATED_NO_DEPLOY\n');
  }else{
   process.stdout.write('LIVE_V76_SNAPSHOT_VERIFIED_NO_DEPLOY\n');
  }
 }catch(e){
  process.stderr.write(String(e?.message??'live_v76_preflight_failed')+'\n');
  process.exitCode=1;
 }
}
