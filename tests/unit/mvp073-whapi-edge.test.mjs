import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot,canPrepareBuyerPilot,validMessage}
 from '../../supabase/functions/cotironda-piloto-whapi/core.ts';
test('MVP073: pedido 2 artículos con zona La Plata',()=>{
 const p=parseBuyerPilot('20 bolsas de cemento CPC 50 kg, 5 litros de hidrófugo. Entrega: La Plata.');
 assert.equal(p.city,'La Plata');
 assert.deepEqual(p.items.map(x=>[x.quantity,x.unit,x.family]),[
  [20,'bag','cemento_gris_obra'],[5,'l','hidrofugo']]);
 assert.deepEqual(p.unresolved,[]);
});
test('MVP073: texto sin zona no se distribuye',()=>{
 const p=parseBuyerPilot('20 bolsas de cemento CPC 50 kg');
 assert.equal(p.city,null);
 assert.equal(p.items.length,1);
});
test('MVP073: un material sospechoso nunca pasa como cemento común',()=>{
 const p=parseBuyerPilot('5 bolsas de cemento de contacto. Entrega: La Plata.');
 assert.equal(p.items.length,0);
 assert.equal(p.unresolved.length,1);
});
test('MVP073: descripción no reconocida queda a revisar',()=>{
 const p=parseBuyerPilot('4 bolsas de pegamento especializado. Entrega: La Plata.');
 assert.equal(p.items.length,0);
 assert.equal(p.unresolved.length,1);
});
test('MVP073: Whapi directo válido y grupo / remitente distinto rechazados',()=>{
 const x={id:'message-20261101001',type:'text',from_me:false,
  chat_id:'5492211234567@s.whatsapp.net',from:'5492211234567',
  timestamp:1793570000,text:{body:'20 bolsas de cemento'}};
 assert.equal(validMessage(x,1793570000),true);
 assert.equal(validMessage({...x,chat_id:'5492211234567@g.us'},1793570000),false);
 assert.equal(validMessage({...x,from:'5492219999999'},1793570000),false);
 assert.equal(validMessage({...x,from_me:true},1793570000),false);
 assert.equal(validMessage({...x,timestamp:1700000000},1793570000),false);
});
test('MVP073: esquema private; RPC solo role, confirmación y banderas apagadas',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp073_whapi_private_inbox.sql',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(sql,/alter table cotironda_piloto_privado.enrollment_codes enable row level security/);
 assert.match(sql,/alter table cotironda_piloto_privado.whapi_inbox enable row level security/);
 assert.match(sql,/grant execute on function public.cotironda_piloto_receive_whapi_v1/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/create function public.cotironda_piloto_optout_whapi_v1/);
 assert.match(edge,/COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED/);
 assert.match(edge,/x-cotironda-webhook-key/);
 assert.match(edge,/AES-GCM/);
 assert.match(edge,/cotironda_piloto_receive_whapi_v1/);
 assert.match(edge,/https:\/\/gate\.whapi\.cloud\/messages\/text/);
 assert.match(edge,/COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED/);
 assert.match(edge,/cotironda_piloto_authorize_whapi_v1/);
 assert.match(edge,/cotironda_piloto_finish_whapi_v1/);
 assert.doesNotMatch(edge,/\b221\d{7}\b/);
});

test('MVP073: NO enviar pedido parcialmente reconocido, ni sin zona',()=>{
 const parcial=parseBuyerPilot('20 bolsas de cemento CPC 50 kg, 2 bolsas de adhesivo especial. Entrega: La Plata.');
 assert.equal(parcial.items.length,1);
 assert.equal(parcial.unresolved.length,1);
 assert.equal(canPrepareBuyerPilot(parcial),false);
 const sinZona=parseBuyerPilot('20 bolsas de cemento CPC 50 kg');
 assert.equal(canPrepareBuyerPilot(sinZona),false);
 const completo=parseBuyerPilot('20 bolsas de cemento CPC 50 kg, 5 litros de hidrófugo. Entrega: La Plata.');
 assert.equal(canPrepareBuyerPilot(completo),true);
 const soloDesconocido=parseBuyerPilot('2 bolsas de material desconocido. Entrega: La Plata.');
 assert.equal(canPrepareBuyerPilot(soloDesconocido),false);
});

test('MVP073: verificación webhook devuelve HTTP 200 sin tocar mensajes y valida canal para mensajes reales',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/if\(!actionable\)/);
 assert.match(edge,/return json\(200,'probe_only'\)/);
 assert.match(edge,/if\(!authenticated\)/);
 assert.match(edge,/return json\(401,'unauthorized'\)/);
 assert.match(edge,/if\(event\.channel_id!==sec\.channel\)return json\(403,\x27wrong_channel\x27\)/);
 const i=edge.indexOf('if(!actionable)');
 const j=edge.indexOf('if(!authenticated)');
 const k=edge.indexOf('const db=client(sec)');
 assert.ok(i>=0&&j>i&&k>j);
});

test('MVP073: HMAC debe especificar SHA-256 al importar clave en WebCrypto/Deno',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/crypto\.subtle\.importKey\('raw',raw,\{name:'HMAC',hash:'SHA-256'\},false,\['sign'\]\)/);
 assert.doesNotMatch(edge,/crypto\.subtle\.importKey\('raw',raw,'HMAC'/);
});

test('MVP073: no-op de Whapi sin autenticación NO puede abrir DB ni enviar',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const noop=edge.indexOf("return json(200,'probe_only')");
 const auth=edge.indexOf("if(!authenticated)");
 const db=edge.indexOf("const db=client(sec)",auth);
 const dispatch=edge.indexOf("await dispatchTwo(sec,db)",auth);
 assert.ok(noop>=0 && auth>noop && db>auth && dispatch>db);
 assert.match(edge,/ev\?\.type==='messages'&&ev\?\.event==='post'&&/);
 assert.match(edge,/Array\.isArray\(event\.messages\)&&event\.messages\.length>0/);
});
