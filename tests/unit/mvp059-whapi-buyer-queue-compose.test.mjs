import test from 'node:test';
import assert from 'node:assert/strict';
import {crearRecorridoCompradorWhatsAppMvp059 as crear}
 from '../../src/server/buyer-whatsapp-pipeline-mvp059.ts';

const CH='coti_channel_059';
const CHAT='c'.repeat(64), MSG1='a'.repeat(64),MSG2='b'.repeat(64);
const BUYER='aaaaaaaa-0059-4059-8059-000000000591';
const ROUND='bbbbbbbb-0059-4059-8059-000000000591';
const LEASE='cccccccc-0059-4059-8059-000000000591';
const ORDER='20 bolsas de cemento CPC 50 kg, 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata.';
const NO_ZONE='20 bolsas de cemento CPC 50 kg y 5 litros de pintura látex';
function encrypted(messageKey){
 return {channel:CH,messageKey,chatKey:CHAT,buyerOrgId:BUYER,
  kind:'text',sourceUnix:messageKey===MSG1?1800000000:1800000010,
  cryptoKeyId:'aes_2026_a',fingerprint:'f'.repeat(64),
  cipherHex:'a1'.repeat(70),nonceHex:'b2'.repeat(12),
  tagHex:'c3'.repeat(16)};
}
function harness({entries=[{key:MSG1,text:ORDER}],missing=false,
  failInvitesOnce=false,failDecrypt=false,enabled=true}={}){
 const jobs=entries.map(e=>({key:e.key,state:'pending',attempt:0}));
 const state={
  calls:[],attempts:[],finishes:[],questions:0,roundWrites:0,
  invited:0,roundIds:new Map(),texts:new Map(entries.map(e=>[e.key,e.text])),
  sqlQueries:0,decode:0
 };
 const sql=(role,handler)=>({query:async(query,args)=>{
  state.calls.push({role,query,args});
  state.sqlQueries++;
  assert.equal(typeof query,'string');assert.ok(Array.isArray(args));
  const payload=await handler(query,args);
  return {rows:[{payload}]};
 }});
 const sqls={
  cola:sql('cola',async(q,args)=>{
   if(q.includes('whapi_claim_buyer_d082')){
    assert.deepEqual(args,[CH]);
    const job=jobs.find(j=>j.state==='pending');
    if(!job)return null;
    job.state='leased';job.attempt++;
    return {channel:CH,messageKey:job.key,leaseToken:LEASE,attempt:job.attempt};
   }
   assert.match(q,/whapi_finish_buyer_d082/u);
   const [channel,key,token,action]=args;
   assert.deepEqual([channel,token],[CH,LEASE]);
   const job=jobs.find(j=>j.key===key);
   assert.equal(job?.state,'leased');
   state.finishes.push(action);
   job.state=action==='retry'?'pending':
    action==='requires_review'?'manual_review':
    action==='no_auth'?'discarded':'done';
   return {state:job.state,attempts:job.attempt};
  }),
  lectura:sql('lectura',async(q,args)=>{
   assert.match(q,/whapi_zone_context_d077/u);
   const [channel,key]=args;assert.equal(channel,CH);
   const found=entries.find(e=>e.key===key);
   if(missing||!found)return null;
   const original=key===MSG2?encrypted(MSG1):null;
   return {entry:encrypted(key),original};
  }),
  zona:sql('zona',async(q,args)=>{
   assert.match(q,/whapi_zone_enqueue_d077/u);
   assert.deepEqual(args.slice(0,3),[CH,CHAT,MSG1]);
   assert.equal(args[3],BUYER);
   state.questions++;
   return {estado:'zona_solicitada_en_cola',repetido:state.questions>1};
  }),
  ronda:sql('ronda',async(q,args)=>{
   assert.match(q,/whapi_create_buyer_round_d081/u);
   state.roundWrites++;
   const [channel,chat,origin,reply,org,zone,iva,materials,days]=args;
   assert.equal(channel,CH);assert.equal(chat,CHAT);assert.equal(org,BUYER);
   assert.equal(origin,MSG1);assert.equal(reply,entries.at(-1).key);
   assert.equal(zone,'La Plata');assert.equal(iva,'no_especificado');
   assert.equal(days,5);
   const parsed=JSON.parse(materials);
   assert.equal(parsed.length,entries.length===1&&entries[0].text===ORDER?3:2);
   if(entries.length===1&&entries[0].text===ORDER)
    assert.deepEqual(parsed.map(x=>[x.product_code,x.quantity,x.unit]),[
     ['cemento_gris_obra','20','bag'],['hidrofugo','10','l'],['pintura_latex','5','l']
    ]);
   const repeated=state.roundIds.has(origin);
   state.roundIds.set(origin,ROUND);
   return {roundId:ROUND,repetida:repeated};
  }),
  invitacion:sql('invitacion',async(q,args)=>{
   assert.match(q,/whapi_prepare_commercial_round_d071/u);
   assert.deepEqual(args,[ROUND,CH]);
   state.invited++;
   if(failInvitesOnce&&state.invited===1)throw Error('PRIVATE_CONNECTION_SECRET');
   return {state:'queued_without_sending',matchedSuppliers:3,
    prepared:state.invited===1?3:0,alreadyPrepared:state.invited>1?3:0,
    pendingContact:0,pendingScope:0,messagesSent:0};
  })
 };
 const worker=crear({habilitado:enabled,canal:CH,sql:sqls,
  verificarContenidoComprador:enc=>{
   state.decode++;
   if(failDecrypt)throw Error('PRIVATE_CONTENT_SECRET');
   assert.equal(enc.channel,CH);assert.equal(enc.chatKey,CHAT);
   assert.equal(enc.buyerOrgId,BUYER);
   assert.ok(Buffer.isBuffer(enc.ciphertext));
   return {tipo:'text',texto:state.texts.get(enc.messageKey)??null,
    marcaTiempoUnix:enc.sourceUnix};
  }
 });
 return {worker,state,sqls,jobs};
}
test('MVP059: arquitecto manda una lista, D082 -> D077 -> D081 -> D071, 3 consultas sin enviar',async()=>{
 const h=harness();
 const result=await h.worker.procesarLote(8);
 assert.deepEqual(result,{procesados:1,finalizados:1,enRevision:0,
  descartados:0,pendientes:0,agotados:0});
 assert.equal(h.state.questions,0);
 assert.equal(h.state.roundWrites,1);
 assert.equal(h.state.invited,1);
 assert.deepEqual(h.state.finishes,['round_saved']);
 assert.deepEqual(h.state.calls.map(x=>x.role),
  ['cola','lectura','ronda','invitacion','cola','cola']);
 assert.equal(h.state.decode,1);
 assert.equal((await h.worker.procesarUno()).estado,'cola_vacia');
 assert.equal(h.jobs[0].state,'done');
});
test('MVP059: falta localidad => solo pregunta duradera; respuesta posterior crea ronda',async()=>{
 const h=harness({entries:[{key:MSG1,text:NO_ZONE},
  {key:MSG2,text:'La Plata'}]});
 assert.equal((await h.worker.procesarUno()).cola,'done');
 assert.deepEqual(h.state.finishes,['zone_queued']);
 assert.equal(h.state.questions,1);assert.equal(h.state.roundWrites,0);
 assert.equal((await h.worker.procesarUno()).cola,'done');
 assert.deepEqual(h.state.finishes,['zone_queued','round_saved']);
 assert.equal(h.state.questions,1);assert.equal(h.state.roundWrites,1);
 assert.equal(h.state.invited,1);assert.equal(h.state.decode,3);
});
test('MVP059: error después del COMMIT reintenta misma ronda, sin duplicarla',async()=>{
 const h=harness({failInvitesOnce:true});
 assert.equal((await h.worker.procesarUno()).cola,'pending');
 assert.deepEqual(h.state.finishes,['retry']);
 assert.equal((await h.worker.procesarUno()).cola,'done');
 assert.equal(h.state.roundWrites,2);
 assert.equal(h.state.roundIds.size,1);
 assert.equal(h.state.invited,2);
 assert.deepEqual(h.state.finishes,['retry','round_saved']);
});
test('MVP059: texto ambiguo a revisión, nunca crea ronda/invitaciones',async()=>{
 const h=harness({entries:[{key:MSG1,text:'20 bolsas cemento CPC 50 kg, 10 litros material desconocido. Entrega: La Plata.'}]});
 assert.equal((await h.worker.procesarUno()).cola,'manual_review');
 assert.equal(h.state.roundWrites,0);assert.equal(h.state.invited,0);
 assert.deepEqual(h.state.finishes,['requires_review']);
});
test('MVP059: no hay identidad autorizada: descartado sin leer contenido ni crear ronda',async()=>{
 const h=harness({missing:true});
 assert.equal((await h.worker.procesarUno()).cola,'discarded');
 assert.equal(h.state.decode,0);
 assert.equal(h.state.roundWrites,0);assert.equal(h.state.invited,0);
 assert.deepEqual(h.state.finishes,['no_auth']);
});
test('MVP059: AES/identidad ilegítima reintenta y oculta la excepción privada',async()=>{
 const h=harness({failDecrypt:true});
 assert.equal((await h.worker.procesarUno()).cola,'pending');
 assert.equal(h.state.roundWrites,0);
 assert.equal(h.state.invited,0);
 assert.deepEqual(h.state.finishes,['retry']);
});
test('MVP059: apagado no lee base de datos, no descifra y no hace envíos',async()=>{
 const h=harness({enabled:false});
 assert.deepEqual(await h.worker.procesarUno(),{estado:'desactivado'});
 assert.equal(h.state.sqlQueries,0);assert.equal(h.state.decode,0);
 assert.equal(h.state.invited,0);
});
test('MVP059: exige puertos SQL separados con funciones, no acepta una DB parcial',()=>{
 const h=harness();
 for(const field of ['cola','lectura','zona','ronda','invitacion']){
  const ports={...h.sqls,[field]:{}};
  assert.throws(()=>crear({habilitado:true,canal:CH,sql:ports,
   verificarContenidoComprador:()=>{throw Error('should not call')}
  }),/mvp059_worker_privado_no_disponible/);
 }
});
