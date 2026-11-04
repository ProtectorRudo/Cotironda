import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatchPendingPilotSupplierPdfs} from '../../supabase/functions/cotironda-piloto-document-recovery/whapi-dispatch.ts';

const key='11'.repeat(32);
const channel='pilot-test';
const recipients={
 corralon_ailin:'5492211111111',
 corralon_nahuel:'5492212222222'
};
const config={enabled:true,hmacHex:key,channel,token:'t'.repeat(40),
 recipientsJson:JSON.stringify(recipients)};
async function hash(to){
 const raw=Uint8Array.from(key.match(/.{2}/g),x=>parseInt(x,16));
 const k=await crypto.subtle.importKey('raw',raw.buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const x=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(
  'cotironda|pilot|chat|'+channel+'|'+to+'@s.whatsapp.net'));
 return Buffer.from(x).toString('hex');
}
const snapshot={requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',city:'La Plata',
 deadlineIso:'2026-11-07T19:30:03.000Z',
 items:[{description:'arena fina',quantity:'1.000',unit:'m3'},
 {description:'piedra partida',quantity:'2.000',unit:'m3'},
 {description:'cemento gris de 25 kg',quantity:'25.000',unit:'bag'}]};
test('MVP149: cron privado despacha dos PDF de una sola reserva cada uno',async()=>{
 const pending=['corralon_ailin','corralon_nahuel'];
 const finished=[];let posts=0;
 const io={
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_claim_whapi_v1'){
    const supplier=pending.shift();
    return {data:supplier?{state:'leased',request_id:snapshot.requestId,
      supplier_key:supplier,chat_hmac:await hash(recipients[supplier]),
      lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',message_body:'Solicitud'}:
      {state:'empty'},error:null};
   }
   if(name==='cotironda_piloto_authorize_whapi_v1')return {data:true,error:null};
   if(name==='cotironda_piloto_pdf_snapshot_mvp091')return {data:snapshot,error:null};
   if(name==='cotironda_piloto_finish_whapi_v1'){
    finished.push(params.p_state);return {data:true,error:null};
   }
   throw Error('unexpected RPC '+name);
  },
  post:async(url,init)=>{
   posts++;assert.equal(url,'https://gate.whapi.cloud/messages/document');
   const b=JSON.parse(init.body);
   assert.match(b.media,/^data:application\/pdf;name=Solicitud-Cotironda\.pdf;base64,/);
   assert.ok(Object.values(recipients).includes(b.to));
   return {ok:true,json:async()=>({sent:true,message:{id:'msg-synthetic-123'}})};
  }
 };
 const r=await dispatchPendingPilotSupplierPdfs(config,io);
 assert.deepEqual(r,{claimed:2,accepted:2,uncertain:0});
 assert.equal(posts,2);assert.deepEqual(finished,['api_accepted','api_accepted']);
});
test('MVP149: marca uncertain ante identidad no coincidente y no envia',async()=>{
 let posts=0,finish=null,claims=0;
 const io={
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_claim_whapi_v1')return {data:claims++===0?
     {state:'leased',request_id:snapshot.requestId,supplier_key:'corralon_ailin',
      chat_hmac:'f'.repeat(64),lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      message_body:'Solicitud'}:{state:'empty'},error:null};
   if(name==='cotironda_piloto_finish_whapi_v1'){
    finish=params.p_state;return {data:true,error:null};
   }
   throw Error('unexpected '+name);
  },post:async()=>{posts++;throw Error('no send allowed')}
 };
 const r=await dispatchPendingPilotSupplierPdfs(config,io);
 assert.equal(posts,0);assert.equal(finish,'uncertain');
 assert.deepEqual(r,{claimed:1,accepted:0,uncertain:1});
});
test('MVP149: resultado HTTP incierto no reintenta automaticamente',async()=>{
 let claims=0,posts=0,finished=null;
 const io={
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_claim_whapi_v1')return {data:claims++===0?
     {state:'leased',request_id:snapshot.requestId,supplier_key:'corralon_nahuel',
      chat_hmac:await hash(recipients.corralon_nahuel),
      lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',message_body:'Solicitud'}:
      {state:'empty'},error:null};
   if(name==='cotironda_piloto_authorize_whapi_v1')return {data:true,error:null};
   if(name==='cotironda_piloto_pdf_snapshot_mvp091')return {data:snapshot,error:null};
   if(name==='cotironda_piloto_finish_whapi_v1'){
    finished=params.p_state;return {data:true,error:null};
   }
   throw Error('unexpected '+name);
  },post:async()=>{posts++;throw Error('timeout')}
 };
 const r=await dispatchPendingPilotSupplierPdfs(config,io);
 assert.equal(posts,1);assert.equal(finished,'uncertain');assert.equal(r.uncertain,1);
});
test('MVP149: deshabilitado e invalidos fallan antes de reservar',async()=>{
 const io={rpc:async()=>{throw Error('forbidden claim')},post:async()=>{throw Error('forbidden post')}};
 assert.deepEqual(await dispatchPendingPilotSupplierPdfs({...config,enabled:false},io),
  {claimed:0,accepted:0,uncertain:0});
 await assert.rejects(()=>dispatchPendingPilotSupplierPdfs({...config,recipientsJson:'{}'},io),
  /configuration_invalid/);
});
test('MVP149: worker cron solamente dentro de autenticacion Vault',()=>{
 const code=readFileSync(new URL('../../supabase/functions/cotironda-piloto-document-recovery/index.ts',import.meta.url),'utf8');
 const guard=code.indexOf('return guardScheduledRecovery(req,');
 const call=code.indexOf('await dispatchPendingPilotSupplierPdfs(');
 assert.ok(guard>=0&&call>guard);
 assert.match(code,/authorize:async\(token\)=>/);
 assert.match(code,/cotironda_piloto_recovery_token_allowed_mvp132/);
 assert.doesNotMatch(code,/console\.log|console\.warn\([^)]*recipient|console\.warn\([^)]*token/u);
});
