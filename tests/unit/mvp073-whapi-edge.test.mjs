import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot,validMessage}
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
 assert.doesNotMatch(edge,/https:\/\/gate\.whapi\.cloud/);
 assert.doesNotMatch(edge,/\b221\d{7}\b/);
});
