import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';

const NOW=1800000000,SECRET='q'.repeat(48),CHANNEL='DEV-CHANNEL-001';
const CHAT='5492211234567@s.whatsapp.net';
const ORG='bbbbbbbb-0000-4000-8000-000000000202';
const ROUND='dddddddd-0000-4000-8000-000000000204';
const M={id:'p.test-0000001',from_me:false,type:'text',
  chat_id:CHAT,from:'5492211234567',timestamp:NOW,
  text:{body:'100 bolsas de cemento a $8500 por bolsa'}};
const PAYLOAD={messages:[M],event:{type:'messages',event:'post'},
  channel_id:CHANNEL};
function req(body=PAYLOAD,headers={},method='POST'){
  return new Request('https://test.invalid/webhook-whapi',{
    method,headers:{'content-type':'application/json',
      'x-cotironda-webhook-key':SECRET,...headers},
    ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
  });
}
const status=async(x)=>({code:x.status,body:x.status===204?null:await x.json()});
function deps(opts={}){
 const map=new Map(),entries=[];
 const state={
  map,entries,
  dep:{habilitado:true,canalId:CHANNEL,secretoWebhook:SECRET,ahoraUnix:()=>NOW,
    resolverProveedor:async()=>({supplierOrgId:ORG,roundId:ROUND,
      consentimientoVigente:true,invitacionVigente:true}),
    persistirEntrada:async(x)=>{
      const prior=map.get(x.claveIdempotencia);
      if(prior){if(prior.huellaSha256!==x.huellaSha256)throw Error('colision_id');
        return 'duplicada'}
      map.set(x.claveIdempotencia,x);entries.push(x);return 'guardada';
    },...opts}
 };
 return state;
}
test('integración apagada por defecto: no lee, no persiste ni responde 200',async()=>{
 const s=deps({habilitado:false});const r=await status(await procesarWebhookWhapiAislado(req(),s.dep));
 assert.equal(r.code,503);assert.equal(s.entries.length,0);
});
test('un mensaje Whapi legítimo queda pendiente, no cotizado ni confirmado',async()=>{
 const s=deps();const r=await status(await procesarWebhookWhapiAislado(req(),s.dep));
 assert.deepEqual(r,{code:200,body:{estado:'entradas_persistidas',
  guardadas:1,duplicadas:0,presupuestosConfirmados:0,mensajesEnviados:0}});
 assert.equal(s.entries.length,1);
 assert.equal(s.entries[0].estado,'pendiente_interpretacion');
 assert.equal(s.entries[0].proveedorOrgId,ORG);
 assert.equal(s.entries[0].rondaId,ROUND);
 assert.equal(s.entries[0].texto,M.text.body);
 assert.equal(s.entries[0].claveIdempotencia.length,64);
 assert.equal(JSON.stringify(r).includes(CHAT),false);
 assert.equal(JSON.stringify(r).includes(SECRET),false);
});
test('reenvío Whapi: misma clave idempotente, sin doble alta',async()=>{
 const s=deps();
 await procesarWebhookWhapiAislado(req(),s.dep);
 const r=await status(await procesarWebhookWhapiAislado(req(),s.dep));
 assert.equal(r.code,200);assert.equal(r.body.duplicadas,1);
 assert.equal(s.entries.length,1);
});
test('mismo ID con texto alterado se rechaza y no se confirma',async()=>{
 const s=deps();
 await procesarWebhookWhapiAislado(req(),s.dep);
 const changed={...PAYLOAD,messages:[{...M,text:{body:'Monto adulterado'}}]};
 const r=await status(await procesarWebhookWhapiAislado(req(changed),s.dep));
 assert.equal(r.code,503);assert.equal(s.entries.length,1);
});
test('header faltante, incorrecto o muy corto: nunca llega a resolver empresa',async()=>{
 let n=0;const s=deps({resolverProveedor:async()=>{n++;return null}});
 for(const headers of [
  {'x-cotironda-webhook-key':''},
  {'x-cotironda-webhook-key':'wrong'},
  {'x-cotironda-webhook-key':SECRET+'extra'}
 ]){
  const r=await status(await procesarWebhookWhapiAislado(req(PAYLOAD,headers),s.dep));
  assert.equal(r.code,401);
 }
 assert.equal(n,0);assert.equal(s.entries.length,0);
});
test('sin secreto configurado no hay webhook aunque llegue header idéntico',async()=>{
 const s=deps({secretoWebhook:'short'});
 assert.equal((await status(await procesarWebhookWhapiAislado(req(PAYLOAD,{'x-cotironda-webhook-key':'short'}),s.dep))).code,503);
});
test('canal equivocado o intento de inyectar identidad no habilita escritura',async()=>{
 const s=deps();
 const mismatched={...PAYLOAD,channel_id:'OTRO-CANAL',
   supplierOrgId:'aaaaaaaa-0000-4000-8000-000000000201'};
 assert.equal((await status(await procesarWebhookWhapiAislado(req(mismatched),s.dep))).code,403);
 const forged={...PAYLOAD,supplierOrgId:'aaaaaaaa-0000-4000-8000-000000000201',
  roundId:'aaaaaaaa-0000-4000-8000-000000000201',
  messages:[{...M,supplierOrgId:'aaaaaaaa-0000-4000-8000-000000000201'}]};
 assert.equal((await status(await procesarWebhookWhapiAislado(req(forged),s.dep))).code,200);
 assert.equal(s.entries[0].proveedorOrgId,ORG);assert.equal(s.entries[0].rondaId,ROUND);
});
test('remitente no invitado, sin opt-in o vínculo ambiguo: 403 y sin persistir',async()=>{
 for(const binding of [null,
  {supplierOrgId:ORG,roundId:ROUND,consentimientoVigente:false,invitacionVigente:true},
  {supplierOrgId:ORG,roundId:ROUND,consentimientoVigente:true,invitacionVigente:false},
  {supplierOrgId:'no',roundId:ROUND,consentimientoVigente:true,invitacionVigente:true}]){
  const s=deps({resolverProveedor:async()=>binding});
  assert.equal((await status(await procesarWebhookWhapiAislado(req(),s.dep))).code,403);
  assert.equal(s.entries.length,0);
 }
});
test('remitente inconsistente con chat o teléfono como grupo no se registra',async()=>{
 const s=deps();
 const forged={...PAYLOAD,messages:[{...M,from:'5491111111111'}]};
 assert.equal((await status(await procesarWebhookWhapiAislado(req(forged),s.dep))).code,422);
 const group={...PAYLOAD,messages:[{...M,chat_id:'120363123456@g.us',from:'5492211234567'}]};
 assert.equal((await procesarWebhookWhapiAislado(req(group),s.dep)).status,204);
 assert.equal(s.entries.length,0);
});
test('saliente y notificaciones de estados se descartan sin abrir cotización',async()=>{
 const s=deps();
 const out={...PAYLOAD,messages:[{...M,from_me:true}]};
 assert.equal((await procesarWebhookWhapiAislado(req(out),s.dep)).status,204);
 const statuses={...PAYLOAD,messages:undefined,event:{type:'statuses',event:'post'},statuses:[{id:'abc'}]};
 assert.equal((await procesarWebhookWhapiAislado(req(statuses),s.dep)).status,204);
 assert.equal(s.entries.length,0);
});
test('mensaje Confirmo no confirma ninguna oferta sin contexto autorizado',async()=>{
 const s=deps();const payload={...PAYLOAD,messages:[{...M,text:{body:'Confirmo'}}]};
 const r=await status(await procesarWebhookWhapiAislado(req(payload),s.dep));
 assert.equal(r.code,200);assert.equal(s.entries[0].texto,'Confirmo');
 assert.equal(s.entries[0].estado,'pendiente_interpretacion');
 assert.equal(r.body.presupuestosConfirmados,0);
});
test('foto, audio y documento quedan pendientes sin seguir URL no confiable',async()=>{
 const s=deps();
 const media=['image','voice','document'].map((type,i)=>({
  ...M,id:'p.media-000000'+i,type,
  [type]:{link:'http://169.254.169.254/latest/meta-data',filename:'malicioso.exe'}
 }));
 const r=await status(await procesarWebhookWhapiAislado(req({...PAYLOAD,messages:media}),s.dep));
 assert.equal(r.code,200);assert.equal(s.entries.length,3);
 assert.ok(s.entries.every(x=>x.texto===null&&x.estado==='pendiente_interpretacion'));
 assert.equal(JSON.stringify(s.entries).includes('169.254'),false);
});
test('lote de dos mensajes: persiste ambos antes de ACK y replica idempotente',async()=>{
 const s=deps();const two={...PAYLOAD,messages:[M,{...M,id:'p.test-0000002'}]};
 const res=await status(await procesarWebhookWhapiAislado(req(two),s.dep));
 assert.equal(res.code,200);assert.equal(res.body.guardadas,2);
 const res2=await status(await procesarWebhookWhapiAislado(req(two),s.dep));
 assert.equal(res2.code,200);assert.equal(res2.body.duplicadas,2);
 assert.equal(s.entries.length,2);
});
test('fallo al persistir el segundo no da ACK falso; reintento deduplica primero',async()=>{
 let fail=true,attempt=0;
 const s=deps();
 const original=s.dep.persistirEntrada;
 s.dep.persistirEntrada=async x=>{
   attempt++;if(fail&&attempt===2)throw Error('db_timeout');
   return original(x);
 };
 const two={...PAYLOAD,messages:[M,{...M,id:'p.test-0000002'}]};
 assert.equal((await procesarWebhookWhapiAislado(req(two),s.dep)).status,503);
 assert.equal(s.entries.length,1);
 fail=false;
 const res=await status(await procesarWebhookWhapiAislado(req(two),s.dep));
 assert.equal(res.code,200);assert.equal(res.body.guardadas,1);
 assert.equal(res.body.duplicadas,1);assert.equal(s.entries.length,2);
});
test('payload inválido o excesivo no escribe',async()=>{
 const s=deps();
 const invalid=[
 { ...PAYLOAD,messages:[]},
 {...PAYLOAD,messages:Array.from({length:11},(_,i)=>({...M,id:'p.fake-000000'+i}))},
 {...PAYLOAD,messages:[M,M]},
 {...PAYLOAD,messages:[{...M,id:'a'}]},
 {...PAYLOAD,messages:[{...M,timestamp:NOW-172801}]},
 {...PAYLOAD,messages:[{...M,timestamp:NOW+301}]},
 {...PAYLOAD,messages:[{...M,text:{body:' '}}]},
 {...PAYLOAD,messages:[{...M,text:{body:'a'.repeat(3001)}}]},
 {...PAYLOAD,messages:[{...M,from:undefined}]}
 ];
 for(const item of invalid){
  const r=await procesarWebhookWhapiAislado(req(item),s.dep);
  assert.equal(r.status,422);
 }
 assert.equal(s.entries.length,0);
 const big=' '.repeat(70000);
 const r=await procesarWebhookWhapiAislado(req(big),s.dep);
 assert.equal(r.status,413);
});
test('tamaño por header antes de decodificar, tipo MIME y método incorrectos',async()=>{
 const s=deps();
 assert.equal((await procesarWebhookWhapiAislado(req(PAYLOAD,{'content-length':'1000000'}),s.dep)).status,413);
 assert.equal((await procesarWebhookWhapiAislado(req(PAYLOAD,{'content-type':'text/plain'}),s.dep)).status,415);
 assert.equal((await procesarWebhookWhapiAislado(req(PAYLOAD,{},'GET'),s.dep)).status,405);
 assert.equal(s.entries.length,0);
});
test('error al resolver deja lote sin ACK ni datos; no revela chat',async()=>{
 const s=deps({resolverProveedor:async()=>{throw Error('contacto_interno_221123')}}); 
 const res=await procesarWebhookWhapiAislado(req(),s.dep);
 assert.equal(res.status,503);
 assert.equal((await res.text()).includes('221123'),false);
 assert.equal(s.entries.length,0);
});

test('BAJA corta por canal, sin exigir invitación ni guardar presupuestos',async()=>{
 const s=deps({resolverProveedor:async()=>{throw Error('no resolver BAJA')}});
 const dados=new Map();
 s.dep.registrarBaja=async(canal,chat,id,hash,timestamp)=>{
   assert.equal(canal,CHANNEL);assert.equal(chat,CHAT);assert.equal(timestamp,NOW);
   const k=canal+'|'+id;
   if(dados.has(k)){assert.equal(dados.get(k),hash);return 'duplicada'}
   dados.set(k,hash);return 'registrada';
 };
 const msg={...PAYLOAD,messages:[{...M,text:{body:'  baja  '}}]};
 const r=await status(await procesarWebhookWhapiAislado(req(msg),s.dep));
 assert.equal(r.code,200);assert.equal(r.body.bajasRegistradas,1);
 assert.equal(r.body.presupuestosConfirmados,0);
 assert.equal(s.entries.length,0);
 const r2=await status(await procesarWebhookWhapiAislado(req(msg),s.dep));
 assert.equal(r2.code,200);assert.equal(r2.body.duplicadas,1);
 assert.equal(dados.size,1);
});
test('BAJA exige persistencia real; sin adaptador no confirma recepción',async()=>{
 const s=deps();
 const msg={...PAYLOAD,messages:[{...M,text:{body:'BAJA'}}]};
 assert.equal((await procesarWebhookWhapiAislado(req(msg),s.dep)).status,503);
 assert.equal(s.entries.length,0);
});
test('BAJA no se ejecuta si el webhook no supera autenticación',async()=>{
 let count=0;
 const s=deps({registrarBaja:async()=>{count++;return 'registrada'}});
 const payload={...PAYLOAD,messages:[{...M,text:{body:'BAJA'}}]};
 const r=await procesarWebhookWhapiAislado(req(payload,
  {'x-cotironda-webhook-key':'invalid'}),s.dep);
 assert.equal(r.status,401);assert.equal(count,0);
});
test('una frase que menciona BAJA no desuscribe por accidente',async()=>{
 let count=0;
 const s=deps({registrarBaja:async()=>{count++;return 'registrada'}});
 const payload={...PAYLOAD,messages:[{...M,text:{body:'¿Cómo doy de BAJA una línea?' }}]};
 const r=await status(await procesarWebhookWhapiAislado(req(payload),s.dep));
 assert.equal(r.code,200);assert.equal(r.body.guardadas,1);
 assert.equal(count,0);assert.equal(s.entries.length,1);
});
test('fallo al registrar BAJA no devuelve un ACK falso',async()=>{
 const s=deps({registrarBaja:async()=>{throw Error('db_fail')}});
 const msg={...PAYLOAD,messages:[{...M,text:{body:'BAJA'}}]};
 const r=await status(await procesarWebhookWhapiAislado(req(msg),s.dep));
 assert.equal(r.code,503);assert.equal(r.body.error,'baja_no_disponible');
 assert.equal(s.entries.length,0);
});
