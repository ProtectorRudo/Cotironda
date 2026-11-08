/** MVP319 — Offline contract test of REAL MVP223+314+315 coordination.
 * No network, no credentials, no production data, no external WhatsApp.
 * The buyer request is already interpreted/published: this is NOT complete E2E.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {continuarDespachoMvp314} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-batch-mvp314.ts';
import {despacharSolicitudCentralMvp223} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
import {avisarCompradorTrasLoteMvp315} from '../../supabase/functions/cotironda-piloto-whapi/buyer-tracking-after-batch-mvp315.ts';

const REQUEST = '469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const CHAT_HASH = 'a'.repeat(64);
const EVENT_HASH = 'b'.repeat(64);
const CHANNEL = 'sandbox_sintetico';
const BUYER_JID = '199900000001@s.whatsapp.net'; // impossible to deliver: NO HTTP in this test
const b64 = bytes => Buffer.from(bytes).toString('base64');
const hex = bytes => Buffer.from(bytes).toString('hex');
const ok = data => ({data,error:null});

async function scenario(count, options={}) {
  assert.ok(count>=1 && count<=20);
  const providers=Array.from({length:count},(_,i)=>'proveedor_'+String(i+1));
  const recipients=new Map(providers.map((key,i)=>[key,'1999000000'+String(i+10)]));
  const pending=[...providers];
  const state={
    recipients,providers,pending,claims:new Map(),supplierSent:[],
    buyerSent:[],buyerFinalized:null,buyerIssued:null,buyerRecorded:null,
    calls:[],reconciliation:[],revoked:options.revokedBuyer??false
  };
  const enc=new TextEncoder();
  const hmacKey=await crypto.subtle.importKey('raw',
    crypto.getRandomValues(new Uint8Array(32)),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const aesKey=await crypto.subtle.importKey('raw',
    crypto.getRandomValues(new Uint8Array(32)),'AES-GCM',false,['encrypt','decrypt']);
  const buyerHash=hex(await crypto.subtle.sign('HMAC',hmacKey,enc.encode(
    'cotironda|pilot|chat|'+CHANNEL+'|'+BUYER_JID)));
  const buyerSha=hex(await crypto.subtle.digest('SHA-256',enc.encode(BUYER_JID)));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:enc.encode(buyerHash+'|cotironda-contact-v1'),
    tagLength:128
  },aesKey,enc.encode(BUYER_JID)));
  const buyerPacket={
    state:'ready',request_id:REQUEST,chat_hmac:buyerHash,
    event_hmac:EVENT_HASH,channel_id:CHANNEL,contact_sha256:buyerSha,
    nonce_b64:b64(iv),ciphertext_b64:b64(cipher),source:'authenticated_whapi'
  };
  const fullyAccepted=()=>providers.every(key=>state.claims.get(key)?.status==='api_accepted');
  const rpc=async(name,args)=>{
    state.calls.push(name);
    switch(name){
      case 'cotironda_piloto_ia_next_batch_mvp314':
        assert.deepEqual(args,{});
        return ok(pending.length?{state:'ready',request_id:REQUEST}:{state:'empty'});
      case 'cotironda_piloto_ia_claim_mvp314':{
        assert.equal(args.p_request,REQUEST);
        const supplier=pending.shift();
        if(!supplier)return ok({state:'empty'});
        const lease='469cb459-5f00-49c2-b0b9-bc8b11e5'+String(1000+state.claims.size).padStart(4,'0');
        state.claims.set(supplier,{lease,status:'leased'});
        return ok({state:'leased',request_id:REQUEST,supplier_key:supplier,
          lease_token:lease,chat_hmac:CHAT_HASH});
      }
      case 'cotironda_piloto_ia_pdf_snapshot_mvp222':{
        const current=[...state.claims.entries()].find(([key,value])=>
          key===args.p_supplier && value.lease===args.p_lease);
        assert.ok(current);
        return ok({requestId:REQUEST,city:'La Plata',
          deadlineIso:'2026-11-15T18:00:00Z',deliveryNote:null,
          items:[{description:'Cemento CPC 50 kg',quantity:'20',unit:'bag'}]});
      }
      case 'cotironda_piloto_ia_finish_mvp222':{
        const claim=state.claims.get(args.p_supplier);
        assert.equal(args.p_request,REQUEST);
        assert.equal(claim?.lease,args.p_lease);
        assert.equal(claim?.status,'leased');
        assert.ok(['api_accepted','uncertain'].includes(args.p_state));
        if(args.p_state==='api_accepted')assert.match(args.p_message_id,/^fake-supplier-ack-/);
        claim.status=args.p_state;
        return ok(true);
      }
      case 'cotironda_piloto_ia_next_buyer_notice_mvp315':
        assert.equal(args.p_channel,CHANNEL);
        return ok(fullyAccepted() && !state.buyerIssued
          ?buyerPacket:{state:'empty'});
      case 'cotironda_piloto_ia_issue_buyer_notice_mvp315':
        assert.equal(args.p_request,REQUEST);
        assert.equal(args.p_chat_hmac,buyerHash);
        assert.equal(args.p_event_hmac,EVENT_HASH);
        assert.equal(args.p_channel,CHANNEL);
        if(!fullyAccepted() || state.buyerIssued)return ok({state:'not_eligible'});
        assert.match(args.p_token_hash,/^[0-9a-f]{64}$/);
        state.buyerIssued=args.p_token_hash;
        return ok({state:'issued',request_id:REQUEST});
      case 'cotironda_piloto_ia_buyer_packet_mvp315':
        return ok(args.p_request===REQUEST && args.p_channel===CHANNEL &&
          args.p_token_hash===state.buyerIssued && fullyAccepted() && !state.revoked
          ?buyerPacket:null);
      case 'cotironda_piloto_ia_authorize_buyer_notice_mvp315':
        return ok(!state.revoked && fullyAccepted() &&
          args.p_token_hash===state.buyerIssued && args.p_chat_hmac===buyerHash);
      case 'cotironda_piloto_finish_tracking_mvp091':
        assert.equal(args.p_token_hash,state.buyerIssued);
        assert.equal(state.buyerFinalized,null);
        state.buyerFinalized=args.p_state;
        return ok(true);
      case 'cotironda_piloto_record_tracking_id_mvp119':
        assert.equal(args.p_token_hash,state.buyerIssued);
        assert.equal(state.buyerFinalized,'api_accepted');
        state.buyerRecorded=args.p_whapi_message_id;
        return ok(true);
      default:
        throw Error('Unexpected SQL RPC: '+name);
    }
  };
  const dispatch=async requestId=>despacharSolicitudCentralMvp223({
    enabled:true,requestId,recipients:{},maxJobs:1,
    claimRpcName:'cotironda_piloto_ia_claim_mvp314',rpc,
    resolveRecipient:async lease=>{
      const claim=state.claims.get(lease.supplierKey);
      assert.equal(lease.requestId,REQUEST);
      assert.equal(claim?.lease,lease.leaseToken);
      assert.equal(lease.chatHmac,CHAT_HASH);
      return recipients.get(lease.supplierKey);
    },
    authorizeChatHmac:async(recipient,hash)=>Boolean(
      [...recipients.values()].includes(recipient) && hash===CHAT_HASH),
    createPdf:snapshot=>{
      assert.equal(snapshot.requestId,REQUEST);
      assert.equal(snapshot.items.length,1);
      return Buffer.from('%PDF-1.4\n'+'synthetic PDF only '.repeat(8));
    },
    sendWhapi:async(to,pdf)=>{
      assert.match(Buffer.from(pdf.subarray(0,8)).toString(),/^%PDF-/);
      assert.ok([...recipients.values()].includes(to));
      const index=state.supplierSent.length;
      state.supplierSent.push(to); // Fake transport; no network.
      if(options.uncertainIndex===index)return {accepted:false,messageId:null};
      return {accepted:true,messageId:'fake-supplier-ack-'+String(index+100)};
    }
  });
  const batch=()=>continuarDespachoMvp314({enabled:true,rpc,dispatch});
  const buyer=()=>avisarCompradorTrasLoteMvp315({
    enabled:true,keys:{hmacKey,aesKey,channel:CHANNEL},rpc,
    send:async(to,body)=>{
      assert.equal(to,BUYER_JID);
      assert.match(body,/Seguí las cotizaciones por rubro/u);
      assert.match(body,/\/seguimiento#[a-f0-9]{64}/u);
      assert.doesNotMatch(body,/1999000000/u);
      state.buyerSent.push({to,body}); // Fake transport; no network.
      return {accepted:true,messageId:'fake-buyer-ack-12345'};
    }
  });
  return {state,batch,buyer,rpc,keys:{hmacKey,aesKey,channel:CHANNEL},dispatch};
}

test('MVP319: disabled gates require neither RPC nor outbound',async()=>{
  const s=await scenario(2);
  const b=await continuarDespachoMvp314({enabled:false,rpc:s.rpc,dispatch:s.dispatch});
  const n=await avisarCompradorTrasLoteMvp315({enabled:false,keys:s.keys,
    rpc:s.rpc,send:async()=>{throw Error('must not send')}});
  assert.equal(b.estado,'inactivo');
  assert.equal(n.estado,'apagado');
  assert.equal(s.state.calls.length,0);
  assert.equal(s.state.supplierSent.length,0);
});

test('MVP319: two suppliers -> two accepted IDs -> ONE private buyer notice',async()=>{
  const s=await scenario(2);
  const b=await s.batch();
  assert.deepEqual([b.reclamados,b.apiAceptados,b.inciertos],[2,2,0]);
  assert.equal(s.state.buyerSent.length,0);
  const n=await s.buyer();
  assert.equal(n.estado,'api_aceptada');
  assert.equal(n.intentos,1);
  assert.equal(s.state.buyerSent.length,1);
  assert.equal(s.state.buyerFinalized,'api_accepted');
  assert.equal(s.state.buyerRecorded,'fake-buyer-ack-12345');
  const repeat=await s.buyer();
  assert.equal(repeat.estado,'sin_trabajos');
  assert.equal(s.state.buyerSent.length,1);
  assert.equal(s.state.supplierSent.length,2);
});

test('MVP319: five suppliers require three ticks; never notify prematurely',async()=>{
  const s=await scenario(5);
  for(const expected of [2,4]){
    const b=await s.batch();
    assert.equal(b.reclamados,2);
    assert.equal(s.state.supplierSent.length,expected);
    const n=await s.buyer();
    assert.equal(n.estado,'sin_trabajos');
    assert.equal(s.state.buyerSent.length,0);
  }
  const b=await s.batch();
  assert.equal(b.reclamados,1);
  assert.equal(s.state.supplierSent.length,5);
  assert.equal((await s.buyer()).estado,'api_aceptada');
  assert.equal((await s.buyer()).estado,'sin_trabajos');
  assert.equal(s.state.buyerSent.length,1);
});

test('MVP319: uncertain supplier response blocks buyer notice permanently',async()=>{
  const s=await scenario(2,{uncertainIndex:1});
  assert.equal((await s.batch()).inciertos,1);
  assert.equal((await s.buyer()).estado,'sin_trabajos');
  assert.equal((await s.batch()).estado,'sin_trabajos');
  assert.equal(s.state.supplierSent.length,2);
  assert.equal(s.state.buyerSent.length,0);
  assert.deepEqual([...s.state.claims.values()].map(x=>x.status),
    ['api_accepted','uncertain']);
});

test('MVP319: buyer revocation immediately before HTTP suppresses the notice',async()=>{
  const s=await scenario(2,{revokedBuyer:true});
  await s.batch();
  const n=await s.buyer();
  assert.equal(n.estado,'entrega_incierta');
  assert.equal(s.state.buyerSent.length,0);
  assert.equal(s.state.buyerFinalized,'uncertain');
  assert.equal((await s.buyer()).estado,'sin_trabajos');
  assert.equal(s.state.buyerSent.length,0);
});
