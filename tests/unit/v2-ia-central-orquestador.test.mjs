import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizarRespuestaOficialV2,consultarFuenteFeriadosV2}
 from '../../src/server/v2-ia-central-fuentes-feriados.ts';
import {prepararPedidoCentralV2}
 from '../../src/server/v2-ia-central-orquestador-operativo.ts';

const holidays=[
 '2026-01-01','2026-02-16','2026-02-17','2026-03-24','2026-04-02',
 '2026-04-03','2026-05-01','2026-05-25','2026-06-15','2026-06-20',
 '2026-07-09','2026-08-17','2026-10-12','2026-11-09',
 '2026-11-23','2026-12-08','2026-12-25'
];
const officialUrl='https://www.datos.gob.ar/dataset/jgm-feriados-nacionales';
const contrastUrl='https://api.argentinadatos.com/v1/feriados/2026';
const events=holidays.map((fecha,i)=>({
 fecha,tipo:'inamovible',nombre:'Feriado '+String(i+1)
})).concat({fecha:'2026-12-07',tipo:'puente',
 nombre:'Día no laborable turístico'});
const payload={feriados:events};
const official={role:'gobierno',url:officialUrl,anio:2026};
const contrast={role:'contraste',url:contrastUrl,anio:2026};
const local={cobertura:'anual_completa',
 fuente:'https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224',
 feriados:[{fecha:'2026-11-19',nombre:'Aniversario La Plata',
  tipo:'feriado_local_optativo'}]};
const apiSrc=()=>async (cfg)=>{
 if(cfg.anio!==2026)return null;
 const url=cfg.role==='gobierno'?officialUrl:contrastUrl;
 if(cfg.url!==url)return null;
 return normalizarRespuestaOficialV2(payload,cfg);
};
const article={
 evidencia:'20 bolsas cemento Portland marca flexible 50 kg',
 inicio:0,fin:45,descripcion:'Cemento Portland 50 kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa',
 presentacion:'50 kg',aclaracion:null
};
const pedido={intencion:'cotizar',zona_entrega:'La Plata',
 articulos:[article],dudas:[]};
const proveedor={clave:'ferre_123',activo:true,consentido:true,
 localidades:['La Plata'],articulos:[{numero:1,
 descripcion:'Cemento Portland tipo compatible 25 kg',rubro:'ferreteria'}]};
const goodRoute={
 estado:'ruteo_valido_para_preparacion',
 motivo:'productos_en_catalogo_y_zona_comprobados',
 propuestas:[{proveedor:'ferre_123',correspondencias:[{
  indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
  explicacion:'Misma clase Portland y presentación distinta'
 }]}],
 cobertura:[{indicePedido:0,proveedoresAutorizados:1}],
 revisionTecnica:[],whatsappEnviado:false
};
function args(){
 return {autenticadoPorWebhook:true,fechaCreacionISO:'2026-11-20T13:00:00Z',
  localidad:'La Plata',pedido,catalogos:[proveedor],
  apiKey:'sk-test-example-safe-not-real-abcdefghijklmnopqrstuvwxyz',
  model:'gpt-6-luna',feriadosOptativos:'contar_como_habiles',
  adhesionOptativosConfirmada:false,
  fuentes:{actual:{gobiernoURL:officialUrl,contrasteURL:contrastUrl,
   locales:local}}
 };
}
test('central fetch: fuente JSON de feriados normalizada sin inventar tipos',()=>{
 const a=normalizarRespuestaOficialV2(payload,official);
 assert.equal(a?.feriados.length,18);
 assert.equal(a?.cobertura,'anual_completa');
 assert.equal(a?.feriados.at(-1).tipo,'puente');
 assert.equal(normalizarRespuestaOficialV2(payload,{
  ...official,url:'https://servicio-desconocido.example/feriados'}),null);
 assert.equal(normalizarRespuestaOficialV2({feriados:[
  ...events,{fecha:'2026-11-23',nombre:'Duplicado',tipo:'inamovible'}
 ]},official),null);
});
test('central fetch: no enviar JWT ni permitir redirect, query peligrosa o HTML',async()=>{
 const seen=[];
 const fake=async (url,options)=>{
  seen.push({url,options});
  return new Response(JSON.stringify(events),{status:200,
   headers:{'content-type':'application/json'}});
 };
 const x=await consultarFuenteFeriadosV2(contrast,fake);
 assert.equal(x?.feriados.length,18);
 assert.equal(seen.length,1);
 assert.equal(seen[0].options.credentials,'omit');
 assert.equal(seen[0].options.redirect,'error');
 assert.equal(seen[0].options.cache,'no-store');
 assert.equal((await consultarFuenteFeriadosV2({
  ...contrast,url:'http://api.argentinadatos.com/v1/feriados/2026'},fake)),null);
 assert.equal(seen.length,1);
 const fakeHtml=async()=>new Response('<html>error</html>',{status:200,
  headers:{'content-type':'text/html'}});
 assert.equal(await consultarFuenteFeriadosV2(contrast,fakeHtml),null);
});
test('central: calcula cierre antes de pagar IA, sin escribir ni Whapi',async()=>{
 let routed=0,read=0;
 const decision=await prepararPedidoCentralV2({...args(),
  consultar:async c=>{read++;return apiSrc()(c)},
  proponer:async()=>{routed++;return goodRoute}
 });
 assert.equal(read,2);
 assert.equal(routed,1);
 assert.equal(decision.estado,'propuesta_verificada_sin_envio');
 assert.equal(decision.cierre?.venceLocal,'2026-11-25 18:00');
 assert.equal(decision.ruteo?.propuestas[0].proveedor,'ferre_123');
 assert.equal(decision.baseModificada,false);
 assert.equal(decision.whatsappEnviado,false);
});
test('central: fuentes contradictorias no consumen IA ni hacen consultas al comprador',async()=>{
 let ai=0;
 const result=await prepararPedidoCentralV2({...args(),
  consultar:async cfg=>{
   const source=apiSrc()(cfg);
   if(cfg.role==='contraste')return {
    ...(await source),feriados:events.filter(f=>f.fecha!=='2026-11-23')
   };
   return source;
  },
  proponer:async()=>{ai++;return goodRoute}
 });
 assert.equal(result.estado,'revision_interna');
 assert.equal(result.codigo,'discrepancia_entre_fuentes_nacionales');
 assert.equal(result.cierre?.venceISO,null);
 assert.equal(ai,0);
});
test('central: un producto incierto no obliga a actualizar la lista original',async()=>{
 const result=await prepararPedidoCentralV2({...args(),
  consultar:apiSrc(),
  proponer:async()=>({...goodRoute,
   motivo:'equivalencia_no_acreditada',
   estado:'requiere_revision',propuestas:[],revisionTecnica:[{
    proveedor:'ferre_123',indicePedido:0,numeroCatalogo:1,
    motivo:'prestacion_tecnica_sin_acreditar'
   }]})
 });
 assert.equal(result.estado,'revision_interna');
 assert.equal(result.codigo,'equivalencia_no_acreditada');
 assert.equal(result.baseModificada,false);
 assert.equal(result.whatsappEnviado,false);
});
test('central: nunca delega plazo a LLM ni acepta firma Whapi no autenticada',async()=>{
 let calls=0;
 const res=await prepararPedidoCentralV2({...args(),
  autenticadoPorWebhook:false,
  consultar:async()=>{calls++;return null},
  proponer:async()=>{calls++;return goodRoute}
 });
 assert.equal(res.estado,'revision_interna');
 assert.equal(calls,0);
});
