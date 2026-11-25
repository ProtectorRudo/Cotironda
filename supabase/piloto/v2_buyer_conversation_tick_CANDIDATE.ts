/** Private cron tick: SQL authorizes a random single-use token. No chat ID
 * or request ID from the HTTP caller is trusted. */
const TICK_HASH=/^[a-f0-9]{64}$/u;
const TICK_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/iu;
async function conversationTick(req:Request,sec:Secrets):Promise<Response>{
 const token=req.headers.get('x-cotironda-conversation-tick')??'';
 if(!TICK_HASH.test(token))return json(401,'unauthorized');
 const db=client(sec);
 const rpc=async(name:string,params:Record<string,unknown>)=>{
  const r=await db.rpc(name,params);return {data:r.data,error:r.error};
 };
 const auth=await rpc('cotironda_piloto_v2_conversation_consume_tick',{p_digest:await sha(token)});
 if(auth.error||auth.data!==true)return json(401,'unauthorized');
 if(!sec.outbound)return json(503,'conversation_transport_disabled');
 const object=(x:unknown):Record<string,unknown>=>{
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error('conversation_rpc_shape');
  return x as Record<string,unknown>;
 };
 const call=async(name:string,params:Record<string,unknown>)=>{
  const r=await rpc(name,params);if(r.error)throw Error('conversation_rpc');return object(r.data);
 };
 const recipientFor=async(chat:string,id:string)=>{
  const p=await call('cotironda_piloto_v2_conversation_contact',{p_chat_hmac:chat,p_id:id});
  if(typeof p.nonce!=='string'||typeof p.ciphertext!=='string'||typeof p.sha256!=='string')
   throw Error('conversation_contact_unavailable');
  const to=await decryptArchivedText(sec.aes,p.nonce,p.ciphertext,chat+'|cotironda-contact-v1');
  if(!/^[1-9][0-9]{7,16}@s[.]whatsapp[.]net$/u.test(to)||await sha(to)!==p.sha256||
     !equalSecret(await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+'|'+to),chat))
   throw Error('conversation_contact_invalid');
  return to;
 };
 const due=await rpc('cotironda_piloto_v2_conversation_due',{});
 if(due.error||!Array.isArray(due.data))return json(503,'conversation_due_unavailable');
 if(!due.data.length)return json(200,'conversation_empty');
 const work=object(due.data[0]);const chat=String(work.chat_hmac),id=String(work.conversation_id);
 if(!TICK_HASH.test(chat)||!TICK_UUID.test(id))return json(503,'conversation_due_invalid');
 const trial=await call('cotironda_piloto_ia_trial_flags_mvp229',{p_chat_hmac:chat});
 if(trial.state!=='active'||trial.buyer!==true)return json(200,'conversation_trial_inactive');
 if(work.phase==='interpretation'){
  const model=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL')==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
  const state=await procesarConversacionV2(chat,id,{
   rpc,apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',model,
   decrypt:(n,c,aad)=>decryptArchivedText(sec.aes,n,c,aad),sha,
   sendClarification:async(g,h,event,body)=>{
    let outcome:'api_accepted'|'uncertain'='uncertain';
    try{
     const to=await recipientFor(h,g);
     const current=await rpc('cotironda_piloto_v2_conversation_reply_current',{p_chat_hmac:h,p_id:g,p_event_hmac:event});
     if(!current.error&&current.data===true){
      const response=await fetch('https://gate.whapi.cloud/messages/text',{method:'POST',
       headers:{Authorization:'Bearer '+sec.token,'Content-Type':'application/json'},
       body:JSON.stringify({to,body}),signal:AbortSignal.timeout(12000)});
      const value=response.ok?await response.json().catch(()=>null):null;
      if(response.ok&&value?.sent===true)outcome='api_accepted';
     }
    }catch{/* never retry unknown network outcome */}
    const r=await rpc('cotironda_piloto_finish_reply_mvp094',{p_message_hmac:event,p_state:outcome});
    if(r.error||r.data!==true)throw Error('conversation_reply_reconciliation');
   }
  });
  console.info('cotironda_conversation_interpretation',state);
  return json(200,'conversation_tick_processed');
 }
 if(work.phase!=='delivery')return json(503,'conversation_phase_invalid');
 const claim=await call('cotironda_piloto_v2_conversation_delivery_claim',{p_chat_hmac:chat,p_id:id});
 if(claim.state!=='claimed')return json(200,'conversation_delivery_not_due');
 const requestId=String(claim.request_id),lease=String(claim.lease),source=String(claim.source_hmac),event=String(claim.event_hmac);
 if(!TICK_UUID.test(requestId)||!TICK_UUID.test(lease)||!TICK_HASH.test(source)||!TICK_HASH.test(event))
  return json(503,'conversation_delivery_claim_invalid');
 const fields={p_chat_hmac:chat,p_id:id,p_lease:lease};
 const finish=async(state:'pending'|'complete'|'review')=>{
  const r=await call('cotironda_piloto_v2_conversation_delivery_finish',{...fields,p_state:state});
  return json(200,r.state===state?'conversation_delivery_recorded':'conversation_delivery_stale');
 };
 try{
  if(trial.dispatch!==true)return finish('pending');
  if(claim.round_state==='draft'){
   const released=await call('cotironda_piloto_v2_auto_release_d013',{p_chat_hmac:chat,p_source_hmac:source});
   if(!['ready_for_delivery','already_published'].includes(String(released.state))||released.request_id!==requestId)
    return finish('review');
  }else if(claim.round_state!=='prepared')return finish('review');
  const before=await call('cotironda_piloto_v2_conversation_delivery_status',fields);
  if(Number(before.uncertain)>0)return finish('review');
  if(Number(before.pending)>0){
   const result=await despacharSolicitudCentralMvp223({
    enabled:true,requestId:requestId,
    recipients:sec.recipients,maxJobs:2,
    resolveRecipient:sec.dynamicRecipients
      ?async lease=>resolverDestinatarioMvp313(lease,{
        hmacKey:sec.key,aesKey:sec.aes,channel:sec.channel
       },async(name,params)=>{
        const response=await db.rpc(name,params);
        return {data:response.data,error:response.error};
       }):undefined,
    rpc:async(name,params)=>{
     const response=await db.rpc(name,params);
     return {data:response.data,error:response.error};
    },
    authorizeChatHmac:async(recipient,expectedHash)=>{
     const computed=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
       '|'+recipient+'@s.whatsapp.net');
     return equalSecret(computed,expectedHash);
    },
    createPdf:generarSolicitudPdfMvp091,
    sendWhapi:async(recipient,pdf)=>{
     const refCaption=Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'
       ?etiquetaReferenciaPedidoV2(requestId):null;
     const response=await fetch('https://gate.whapi.cloud/messages/document',{
      method:'POST',
      headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({
       to:recipient,media:'data:application/pdf;name=Solicitud-Cotironda.pdf;base64,'+b64(pdf),
       mime_type:'application/pdf',filename:'Solicitud-Cotironda.pdf',
       caption:CAPTION_PEDIDO_COTIRONDA_MVP305+(refCaption?'\n'+refCaption:'')
      }),
      signal:AbortSignal.timeout(12000)
     });
     const payload=response.ok?await response.json().catch(()=>null):null;
     const value=payload&&typeof payload==='object'?
       payload as Record<string,unknown>:null;
     const message=value?.message&&typeof value.message==='object'?
       value.message as Record<string,unknown>:null;
     const id=value?.message_id??message?.id??value?.id;
     return {accepted:response.ok&&value?.sent===true,
      messageId:typeof id==='string'?id:null};
    }
   });
   if(result.estado==='requiere_conciliacion')return finish('review');
  }
  const after=await call('cotironda_piloto_v2_conversation_delivery_status',fields);
  if(Number(after.uncertain)>0||Number(after.total)<1)return finish('review');
  if(Number(after.pending)>0)return finish('pending');
  if(Number(after.accepted)!==Number(after.total))return finish('review');
  const notice={mode:'auto' as const,requestId,chatHmac:chat,eventHmac:event,recipient:await recipientFor(chat,id)};
  const access=await notificarAccesoWhatsappD016({
    enabled:Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')==='true',webhookAutenticado:true,compradorVerificado:true,
    ...notice,
    portalOrigin:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'',
    portalSha:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'',
    approvedSha:Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'',
    hmacKeyHex:Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'',
    rpc:async(name,params)=>{
     const r=await db.rpc(name,params);
     return {data:r.data,error:r.error};
    },
    authorizeChat:async(recipient,expectedChatHmac)=>{
     if(recipient!==notice.recipient)return false;
     const calculated=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
      '|'+recipient);
     return equalSecret(calculated,expectedChatHmac);
    },
    send:async(recipient,body)=>{
     if(recipient!==notice.recipient)throw Error('d016_buyer_chat_changed');
     const response=await fetch('https://gate.whapi.cloud/messages/text',{
      method:'POST',headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({to:recipient,body}),signal:AbortSignal.timeout(12000)
     });
     const payload=response.ok?await response.json().catch(()=>null):null;
     const value=payload&&typeof payload==='object'?
      payload as Record<string,unknown>:null;
     const nested=value?.message&&typeof value.message==='object'?
      value.message as Record<string,unknown>:null;
     const id=value?.message_id??nested?.id??value?.id;
     return {accepted:response.ok&&value?.sent===true,
      messageId:typeof id==='string'?id:null};
    }
   });
  if(access.estado==='api_aceptada')return finish('complete');
  const known=await call('cotironda_piloto_v2_conversation_link_status',{...fields,p_event_hmac:event});
  return finish(known.state==='api_accepted'?'complete':'review');
 }catch{return finish('review')}
}
