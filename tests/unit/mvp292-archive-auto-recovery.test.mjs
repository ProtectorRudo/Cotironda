import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {procesarPendienteAutomaticoMvp292} from '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
import {reprocesarOriginalHistoricoMvp292} from '../../supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts';
const H='a'.repeat(64),C='b'.repeat(64);
const original='40 bolsas de cemento Avellaneda 25 kg\n3 bolsones de arena';
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
async function digest(v){
 const b=typeof v==='string'?new TextEncoder().encode(v):v;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),
  x=>x.toString(16).padStart(2,'0')).join('');
}
const draft={status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,
 lines:[{original_description:'Cemento Avellaneda 25 kg',quantity:'40',
  unit:'bolsas',unit_price:'$100',line_total:'$4000',
  evidence_location:'p1',ambiguity:null}],
 total_declared:'$4000',unanswered:[]};
test('historical TEXT is decrypted once and independently attributed without messages',async()=>{
 const sha=await digest(original),calls=[];let extracted=0;
 const r=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'synthetic-credential-12345678',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:true,
  shaText:digest,download:async()=>{throw Error('no file fetch for WhatsApp text')},
  decrypt:async(nonce,ciphertext,aad)=>{
   assert.equal(aad,C+'|'+H+'|text');
   return original;
  },
  rpc:async(name,args)=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:H,chat_hmac:C,
     source_sha256:sha,kind:'text',nonce:'cipher_nonce',ciphertext:'cipher_data'},error:null};
   if(name==='cotironda_piloto_finish_auto_recovery_mvp292'){
    assert.equal(args.p_state,'linked');
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected rpc '+name);
  },
  extract:async({source})=>{
   extracted++;assert.equal(source,original);
   return [{line_no:1,description:'cemento Avellaneda 25 kg',
    quantity:'40',unit:'bolsas'}];
  },
  correlate:async({textSha256,textQuote})=>{
   assert.equal(textSha256,sha);
   assert.equal(textQuote[0].quantity,'40');
   return {state:'linked_private',reason:'unique',outboundMessages:0};
  },
  analyzeText:async()=>({estado:'verificado_privado',codigo:'ok',whatsappEnviado:false})
 });
 assert.equal(r.state,'linked_private');
 assert.equal(r.outboundMessages,0);assert.equal(extracted,1);
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_auto_recovery_mvp292',
  'cotironda_piloto_finish_auto_recovery_mvp292'
 ]);
});
test('historical DOCUMENT checks binary SHA and second reading before correlation',async()=>{
 const sha=await digest(bytes);let reads=0,replays=0,binds=0;
 const r=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'synthetic-credential-12345678',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:digest,decrypt:async()=>{throw Error('no text decrypt')},
  download:async(path)=>{
   assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null};
  },
  rpc:async(name,args)=>{
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:H,chat_hmac:C,
      source_sha256:sha,kind:'document',mime:'application/pdf',
      size_bytes:bytes.length,draft},error:null};
   assert.equal(name,'cotironda_piloto_finish_auto_recovery_mvp292');
   assert.equal(args.p_state,'linked');
   return {data:{state:'recorded'},error:null};
  },
  readDocument:async()=>{reads++;return {...draft}},
  correlate:async()=>{binds++;return {state:'linked_private',outboundMessages:0}},
  replay:async(args)=>{
   replays++;assert.equal(args.corroborationSha256,sha);
   assert.deepEqual(args.corroboration,draft);
   return {state:'published_private',reason:'source_vetted',outboundMessages:0};
  }
 });
 assert.equal(r.state,'linked_private');assert.equal(reads,1);
 assert.equal(binds,1);assert.equal(replays,1);
});
test('bad historical SHA and divergent independent interpretation never bind',async()=>{
 const sha=await digest(bytes);
 for(const variant of ['bad-sha','different-material']){
  let correlations=0;
  const r=await procesarPendienteAutomaticoMvp292({
   enabled:true,trustedWorker:true,apiKey:'synthetic-credential-12345678',
   model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
   shaText:digest,decrypt:async()=>{throw Error('not text')},
   download:async()=>({data:new Blob([bytes]),error:null}),
   rpc:async(name,args)=>{
    if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
     return {data:{state:'claimed',source_hmac:H,chat_hmac:C,
      source_sha256:variant==='bad-sha'?'f'.repeat(64):sha,
      kind:'document',mime:'application/pdf',
      size_bytes:bytes.length,draft},error:null};
    assert.equal(name,'cotironda_piloto_finish_auto_recovery_mvp292');
    assert.equal(args.p_state,variant==='bad-sha'?'uncertain':'review');
    return {data:{state:'recorded'},error:null};
   },
   readDocument:async()=>({...draft,lines:[{...draft.lines[0],
     original_description:'Otro material'}]}),
   correlate:async()=>{correlations++;throw Error('should not call')}
  });
  assert.equal(r.state,variant==='bad-sha'?'reconciliation_required':'review_required');
  assert.equal(correlations,0);
 }
});
test('empty, duplicate or disabled recovery has no extra AI, blob or WhatsApp',async()=>{
 let called=0;
 const forbidden=async()=>{called++;throw Error('unexpected')};
 const base={enabled:true,trustedWorker:true,
  apiKey:'synthetic-credential-12345678',model:'gpt-6-luna',
  documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:forbidden,decrypt:forbidden,download:forbidden,
  rpc:async()=>({data:{state:'empty'},error:null})};
 assert.equal((await procesarPendienteAutomaticoMvp292(base)).state,'empty');
 assert.equal((await procesarPendienteAutomaticoMvp292({...base,enabled:false})).state,'disabled');
 assert.equal((await procesarPendienteAutomaticoMvp292({...base,trustedWorker:false})).state,'disabled');
 assert.equal(called,0);
});
test('archive replay keeps economic publication behind original source checks',async()=>{
 const sha=await digest(bytes);const calls=[];
 const r=await reprocesarOriginalHistoricoMvp292({
  enabled:true,trustedInternalWorker:true,sourceHmac:H,chatHmac:C,
  apiKey:'synthetic-credential-12345678',model:'gpt-6-luna',
  documentSemanticEnabled:false,
  corroboration:draft,corroborationSha256:sha,
  download:async()=>({data:new Blob([bytes]),error:null}),
  sourceCheck:async(file,first,second)=>{
   assert.equal(file.sha256,sha);
   assert.deepEqual(first,draft);assert.deepEqual(second,draft);
   return {state:'source_text_covered',reason:'covered',lines:1,
    sourceSha256:sha,sourceVerified:false,
    publicationAllowed:false,rankingAllowed:false};
  },
  rpc:async(name,args)=>{
   calls.push(name);
   const data={
    cotironda_piloto_reserve_archive_replay_mvp292:{
     state:'reserved',sha256:sha,mime:'application/pdf',
     size_bytes:bytes.length,draft},
    cotironda_piloto_record_supplier_media_mvp098:{state:'stored_unverified'},
    cotironda_piloto_compare_supplier_readings_mvp102:{state:'model_readings_match'},
    cotironda_piloto_audit_supplier_amounts_mvp103:{state:'balanced'},
    cotironda_piloto_record_supplier_source_check_mvp106:{state:'source_text_covered'},
    cotironda_piloto_publish_source_text_mvp107:{state:'published_anonymous'},
    cotironda_piloto_finish_archive_replay_mvp292:{state:'recorded'}
   };
   if(!Object.hasOwn(data,name))throw Error('unexpected RPC '+name);
   if(name==='cotironda_piloto_finish_archive_replay_mvp292')
    assert.equal(args.p_state,'published');
   return {data:data[name],error:null};
  }
 });
 assert.equal(r.state,'published_private');
 assert.ok(calls.indexOf('cotironda_piloto_publish_source_text_mvp107')>
  calls.indexOf('cotironda_piloto_record_supplier_source_check_mvp106'));
 assert.equal(r.outboundMessages,0);
});
test('internal recovery entrypoint gated separately from WhatsApp',()=>{
 const code=readFileSync(new URL('../../supabase/functions/cotironda-piloto-auto-recovery/index.ts',import.meta.url),'utf8');
 assert.match(code,/COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED/u);
 // Stronger MVP294 check delegates CONSTANT-TIME validation of TWO factors
 // to a unit-tested helper, rather than comparing only one secret inline.
 assert.match(code,/authorizeRecoveryMvp294/u);
 assert.match(code,/privateHeader:req\.headers\.get\('x-cotironda-recovery-secret'\)/u);
 assert.match(code,/apikeyHeader:req\.headers\.get\('apikey'\)/u);
 assert.match(code,/legacyServiceRole:Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/u);
 assert.match(code,/COTIRONDA_PILOT_AUTO_RECOVERY_SECRET/u);
 assert.doesNotMatch(code,/gate\.whapi\.cloud|messages\/text|messages\/document/u);
});
