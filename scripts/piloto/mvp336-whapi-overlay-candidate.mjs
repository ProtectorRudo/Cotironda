/**
 * MVP336: offline webhook overlay over the explicitly pinned MVP335 source.
 * Does NOT mutate the historic 61-file MVP332 manifest or deploy anything.
 * The v75 live entrypoint must be independently compared again at publish.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepararCandidatoMvp335} from './mvp335-no-confirmation-candidate.mjs';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const INDEX='supabase/functions/cotironda-piloto-whapi/index.ts';
const EXTRA='supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';
const BASE_SHA256='3df77172138e27689123080335e65f2da111a14caac0b2a8034978435371f063';
const EXTRA_GIT_SHA='e94b1aad254389efda09c7e544bf62e12a7b5c42';
const oldImport="from './supplier-auto-correlation-mvp291.ts';";
const newImport="from './supplier-auto-correlation-mvp336.ts';";
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const gitBlob=text=>{
 const bytes=Buffer.from(text,'utf8');
 return createHash('sha1').update('blob '+bytes.length+String.fromCharCode(0)).update(bytes).digest('hex');
};
export function prepararMvp336Overlay({root=ROOT,source}={}){
 const prior=inspeccionarWebhookMvp332(root);
 if(prior.candidate_files!==61||prior.project_ref!=='ilggkalaafhtiysyzlmg')
  throw Error('mvp336_historic_bundle_not_intact');
 const previous=prepararCandidatoMvp335({source});
 if(previous.candidate_sha256!==BASE_SHA256||
    sha256(previous.source)!==BASE_SHA256)
  throw Error('mvp336_expected_mvp335_index_baseline_mismatch');
 if(previous.source.split(oldImport).length!==2)
  throw Error('mvp336_import_not_unique');
 const extra=readFileSync(resolve(root,EXTRA),'utf8');
 if(gitBlob(extra)!==EXTRA_GIT_SHA||
    !extra.includes('elegirRondaUnicaMvp291')||
    !extra.includes('retryReviewedOnce')||
    !extra.includes('cantidadLiteralSinUnidadMvp336('))
  throw Error('mvp336_new_correlator_not_pinned');
 const worker=readFileSync(resolve(root,
  'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts'),'utf8');
 if(!worker.includes(newImport)||
    !worker.includes('cotironda_piloto_claim_reviewed_auto_recovery_mvp336'))
  throw Error('mvp336_worker_not_wired');
 const patched=previous.source.replace(oldImport,newImport);
 if(patched.includes(oldImport)||!patched.includes(newImport)||
    !patched.includes("COTIRONDA_PILOT_WEBHOOK_SECRET")||
    !patched.includes("const authenticated=equalSecret(webhookHeader,sec.webhookSecret)")||
    !patched.includes("if(!sec)return json(503,'pilot_not_enabled')"))
  throw Error('mvp336_runtime_security_regression');
 return Object.freeze({
  state:'candidate_only_not_deployed',
  source_path:INDEX,source:patched,
  baseline_index_sha256:BASE_SHA256,index_sha256:sha256(patched),
  added_file:EXTRA,added_file_git_sha:EXTRA_GIT_SHA,
  file_count:62,original_manifest_preserved:true,
  source_changed_on_disk:false,db_mutated:false,
  outbound_whatsapp_messages:0,production_published:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {source,...r}=prepararMvp336Overlay();
 process.stdout.write(JSON.stringify(r)+'\n');
}
