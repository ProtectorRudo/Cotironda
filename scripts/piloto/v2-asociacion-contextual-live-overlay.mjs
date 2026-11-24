/**
 * Cotironda V2 — staging patch for the EXACT deployed Whapi v101 and
 * auto-recovery v21. No SQL, credentials, messages, deployment or mutations.
 * Historical pinned modules and old GitHub index.ts remain untouched.
 *
 * Consume get_edge_function sources for BOTH live functions, then generate
 * deployment candidate files with these replacements and the new V2 modules.
 * Reject any runtime drift. Never interpret this as published software.
 */
import {createHash} from 'node:crypto';
const sha=(src)=>createHash('sha256').update(src,'utf8').digest('hex');
export const FUENTES_ASOCIACION_V2=Object.freeze({
 whapi:Object.freeze({
  version:101,
  bundle:'af1f063fad866ae5f7fbced8ca63d54f48277bdf13468c4db80605f3a287b139',
  path:'supabase/functions/cotironda-piloto-whapi/index.ts',
  sha256:'ce1fa0e1d7f920e6b80e0ac84950a2a28fdd61407e52c9eb0e606dbf977bcd27'
 }),
 recovery:Object.freeze({
  version:21,
  bundle:'349b64ed4a18717b72a51538e55a6f96b2acf7986ae6f8e773e812600276ecd7',
  path:'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts',
  sha256:'f7a590c280bd9507e057edc7f164d716630395cec8afb27fb71b58ec4f2cb2ea'
 })
});
const reviewedTextClaim=[
 "  if(claimed.state!=='claimed')",
 "  if(claimed.state==='empty')\n   claimed=await db('cotironda_piloto_claim_reviewed_text_v2');\n  if(claimed.state!=='claimed')"
];
const imports=[
 ["from './supplier-auto-correlation-mvp336.ts';",
  "from './supplier-auto-correlation-contextual-v2.ts';"],
 ["from './supplier-text-materials-mvp292.ts';",
  "from './supplier-text-materials-contextual-v2.ts';"]
];
export function sustituirAsociacionV2(source){
 if(typeof source!=='string'||source.length<200)
  throw Error('v2_contextual_invalid_source');
 let patched=source;
 for(const [oldImport,newImport] of imports){
  if(patched.split(oldImport).length!==2||patched.includes(newImport))
   throw Error('v2_contextual_import_drift');
  patched=patched.replace(oldImport,newImport);
 }
 if(patched.length!==source.length+
    imports.reduce((n,[a,b])=>n+b.length-a.length,0))
  throw Error('v2_contextual_unexpected_mutation');
 return patched;
}
function candidate(source,observed,name){
 const expected=FUENTES_ASOCIACION_V2[name];
 if(!observed||observed.version!==expected.version||
    observed.bundle!==expected.bundle||sha(source)!==expected.sha256)
  throw Error('v2_contextual_live_source_drift:'+name);
 let output=sustituirAsociacionV2(source);
 if(name==='recovery'){
  if(output.split(reviewedTextClaim[0]).length!==2)
   throw Error('v2_contextual_recovery_claim_drift');
  output=output.replace(reviewedTextClaim[0],reviewedTextClaim[1]);
 }
 return Object.freeze({path:expected.path,content:output,sha256:sha(output)});
}
export function reconstruirAsociacionUniversalV2(args){
 if(!args||!args.whapi||!args.recovery)
  throw Error('v2_contextual_two_sources_required');
 const whapi=candidate(args.whapi.content,args.whapi,'whapi');
 const recovery=candidate(args.recovery.content,args.recovery,'recovery');
 return Object.freeze({
  state:'candidate_only_not_deployed',
  whapi,recovery,
  addedFiles:Object.freeze([
   'supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-contextual-v2.ts',
   'supabase/functions/cotironda-piloto-whapi/supplier-text-materials-contextual-v2.ts'
  ]),
  usedLiveVersions:Object.freeze({whapi:101,recovery:21}),
  modifiedOriginalSources:false,originalModulesUntouched:true,
  requiresPilotPublication:true,requiresPrivateSqlMigration:true,
  migration:'supabase/piloto/v2_asociacion_texto_revisado_CANDIDATE.sql',
  outboundMessages:0,sqlMutated:false
 });
}
