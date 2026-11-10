import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 auditCandidateAmountsMvp346,registrarRevisionEconomicaPrivadaMvp346
} from '../../supabase/functions/cotironda-piloto-whapi/supplier-economic-revision-mvp346.ts';
import {checkGeneralPdfSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';
import {reprocesarOriginalHistoricoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts';
const H='a'.repeat(64),C='b'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const SHA=createHash('sha256').update(bytes).digest('hex');
const file={mime:'application/pdf',bytes,sha256:SHA};
const original={
 kind:'supplier_quote',status:'review_required',
 delivery_city:null,requested_delivery_note:'Contado. Flete a convenir.',
 lines:[
  {original_description:'Cemento CPC',quantity:'15,00',unit:null,
   unit_price:'$ 120,00',line_total:'$ 1.500,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Arena',quantity:'2,00',unit:null,
   unit_price:'$ 200,00',line_total:'$ 400,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Piedra',quantity:'1,00',unit:null,
   unit_price:'$ 300,00',line_total:'$ 300,00',
   evidence_location:'p1',ambiguity:null}
 ],total_declared:'$ 2.200,00',unanswered:[]
};
const corrected=()=>({...structuredClone(original),
 lines:[{...original.lines[0],unit_price:'$ 100,00'},...original.lines.slice(1)]
});
const sourceCheck=async(_file,revision)=>{
 assert.equal(_file.sha256,SHA);
 assert.deepEqual(revision,corrected());
 return {state:'source_text_covered',reason:'covered',lines:3,
  sourceSha256:SHA,sourceVerified:false,publicationAllowed:false,
  rankingAllowed:false};
};
function setup(second=corrected(),opts={}){
 const calls=[];
 return {calls,args:{
  sourceHmac:H,sourceSha256:SHA,file,original,second,
  sourceCheck:opts.sourceCheck??sourceCheck,
  rpc:async(name,params)=>{
   calls.push({name,params});
   assert.equal(name,'cotironda_piloto_store_revision_candidate_mvp346');
   assert.equal(params.p_message_hmac,H);
   assert.equal(params.p_source_sha256,SHA);
   assert.deepEqual(params.p_candidate,second);
   return {data:{state:opts.dbState??'candidate_stored'},error:null};
  }
 }};
}

test('MVP346: una segunda lectura con precios comprobados se conserva privada; no publica',async()=>{
 const s=setup();
 assert.equal(auditCandidateAmountsMvp346(s.args.second),true);
 const result=await registrarRevisionEconomicaPrivadaMvp346(s.args);
 assert.deepEqual(result,{state:'candidate_stored',
  reason:'economic_revision_private_only',published:false,outboundMessages:0});
 assert.equal(s.calls.length,1);
 assert.notDeepEqual(s.args.original,s.args.second);
 assert.equal(original.lines[0].unit_price,'$ 120,00');
});

test('MVP346: ninguna revisión si los dos modelos coinciden; cero SQL',async()=>{
 const s=setup(structuredClone(original));
 s.args.sourceCheck=async()=>{throw Error('should not parse original twice')};
 const result=await registrarRevisionEconomicaPrivadaMvp346(s.args);
 assert.equal(result.state,'not_applicable');assert.equal(s.calls.length,0);
});

test('MVP346: aritmética exacta sin float, sin descuentos inventados',()=>{
 const good=corrected();
 assert.equal(auditCandidateAmountsMvp346(good),true);
 assert.equal(auditCandidateAmountsMvp346({...good,
  lines:[{...good.lines[0],unit_price:'$ 99,99'},...good.lines.slice(1)]}),false);
 assert.equal(auditCandidateAmountsMvp346({...good,
  lines:[{...good.lines[0],quantity:'16'},...good.lines.slice(1)]}),false);
 assert.equal(auditCandidateAmountsMvp346({...good,total_declared:'$ 2.300,00'}),false);
 assert.equal(auditCandidateAmountsMvp346({...good,total_declared:'$ 2.200'}),false);
 const line={original_description:'Cemento',quantity:'3',unit:'bolsas',
  unit_price:'$ 1.234,50',line_total:'$ 3.703,50',
  evidence_location:'hoja 1 fila 2',ambiguity:null};
 assert.equal(auditCandidateAmountsMvp346({...good,lines:[line],
  total_declared:'$ 3.703,50'}),true);
 assert.equal(auditCandidateAmountsMvp346({...good,lines:[{...line,
  unit_price:'$ 1.234'}],total_declared:'$ 3.703,50'}),false);
});

test('MVP346: fuente sin cobertura, SHA diferente o materiales cambiados quedan privados',async()=>{
 for(const variant of ['source','sha','material','amounts']){
  const s=setup();
  if(variant==='source')s.args.sourceCheck=async()=>({...await sourceCheck(file,corrected()),
    state:'needs_source_review',reason:'uncovered_money'});
  if(variant==='sha')s.args.file={...file,bytes:new Uint8Array(bytes.length)};
  if(variant==='material')s.args.second={...s.args.second,
   lines:[{...s.args.second.lines[0],quantity:'16'},...s.args.second.lines.slice(1)]};
  if(variant==='amounts')s.args.second={...s.args.second,
   lines:[{...s.args.second.lines[0],unit_price:'$ 111,00'},...s.args.second.lines.slice(1)]};
  const r=await registrarRevisionEconomicaPrivadaMvp346(s.args);
  assert.equal(r.state,'source_review_required',variant);
  assert.equal(s.calls.length,0,variant);
 }
});

test('MVP346: error SQL incierto nunca se disfraza de candidata confirmada',async()=>{
 const s=setup(undefined,{dbState:'candidate_conflict'});
 const result=await registrarRevisionEconomicaPrivadaMvp346(s.args);
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.published,false);assert.equal(s.calls.length,1);
});

test('MVP346: worker mantiene cotización en revisión aun con candidata guardada',async()=>{
 const dbCalls=[];
 const rpc=async(name,params)=>{
  dbCalls.push(name);
  const replies={
   cotironda_piloto_reserve_archive_replay_mvp292:{
    state:'reserved',sha256:SHA,mime:'application/pdf',size_bytes:bytes.length,
    draft:original
   },
   cotironda_piloto_record_supplier_media_mvp098:{state:'stored_unverified'},
   cotironda_piloto_store_revision_candidate_mvp346:{state:'candidate_stored'},
   cotironda_piloto_compare_supplier_readings_mvp102:{
    state:'needs_source_review',reason:'line_disagreement'
   },
   cotironda_piloto_finish_archive_replay_mvp292:{state:'recorded'}
  };
  if(!Object.hasOwn(replies,name))throw Error('unexpected rpc '+name);
  if(name==='cotironda_piloto_finish_archive_replay_mvp292'){
   assert.equal(params.p_state,'review');
   assert.equal(params.p_reason,'economic_revision_candidate_private');
  }
  return {data:replies[name],error:null};
 };
 const r=await reprocesarOriginalHistoricoMvp292({
  enabled:true,trustedInternalWorker:true,sourceHmac:H,chatHmac:C,
  apiKey:'synthetic-key-not-real-123456',model:'gpt-6-luna',
  documentSemanticEnabled:false,rpc,
  download:async()=>({data:new Blob([bytes]),error:null}),
  corroboration:corrected(),corroborationSha256:SHA,
  revisionSourceCheck:sourceCheck
 });
 assert.equal(r.state,'review_required');
 assert.equal(r.reason,'economic_revision_candidate_private');
 assert.equal(r.outboundMessages,0);
 assert.equal(dbCalls.includes('cotironda_piloto_store_revision_candidate_mvp346'),true);
 assert.equal(dbCalls.includes('cotironda_piloto_publish_source_text_mvp107'),false);
});

test('MVP346: lector independiente de filas PDF controla todos los importes y notas',async()=>{
 const rows=[
  {page:1,text:'Cemento CPC 15,00 $ 100,00 $ 1.500,00'},
  {page:1,text:'BIG BAG de Arena 2,00 $ 200,00 $ 400,00'},
  {page:1,text:'BIG BAG de Piedra 1,00 $ 300,00 $ 300,00'},
  {page:1,text:'TOTAL $ 2.200,00'},
  {page:1,text:'Contado. Flete a convenir.'}
 ];
 const positioned=async()=>({pages:1,rows,scanned:false});
 const check=await checkGeneralPdfSource(file,corrected(),positioned);
 assert.equal(check.state,'source_text_covered');
 assert.equal(check.reason,'covered');
 const s=setup(undefined,{sourceCheck:(f,d)=>checkGeneralPdfSource(f,d,positioned)});
 const stored=await registrarRevisionEconomicaPrivadaMvp346(s.args);
 assert.equal(stored.state,'candidate_stored');
 assert.equal(s.calls.length,1);
 const extra=async()=>({pages:1,rows:[...rows,
  {page:1,text:'Cargo administrativo $ 25,00'}],scanned:false});
 const rejected=await checkGeneralPdfSource(file,corrected(),extra);
 assert.equal(rejected.state,'needs_source_review');
 assert.equal(rejected.reason,'uncovered_money');
 const bad=setup(undefined,{sourceCheck:(f,d)=>checkGeneralPdfSource(f,d,extra)});
 const result=await registrarRevisionEconomicaPrivadaMvp346(bad.args);
 assert.equal(result.state,'source_review_required');
 assert.equal(bad.calls.length,0);
});
