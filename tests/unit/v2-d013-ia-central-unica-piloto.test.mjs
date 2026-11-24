import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretarConIaCentralV2D013}
 from '../../src/domain/ia-central/cliente-openai-v2-d013.ts';
import {evaluarLecturaCentralUnicaD013,cantidadAcreditadaLecturaUnicaD013}
 from '../../src/domain/ia-central/contrato-v2-d013.ts';
import {planificarMensajeAutenticadoMvp220}
 from '../../src/domain/ia-central/planificador-piloto-v2-d013.ts';
import {armarPreparacionSombraMvp221}
 from '../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';

const source='Hola! Necesito cotizar en La Plata:\n'+
 '- 10 bolsas de cemento CPC de 50 kg.\n'+
 '- 1 bolsón de arena fina de 1 m³.\n'+
 '- 2 rollos de membrana de 4 mm.';
const spans=['10 bolsas de cemento CPC de 50 kg',
 '1 bolsón de arena fina de 1 m³',
 '2 rollos de membrana de 4 mm'];
const first={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:spans.map((evidencia,i)=>({
  evidencia,descripcion:['Cemento CPC 50 kg','Arena fina big bag 1m3',
   'Membrana aluminizada de marca inexistente'][i],
  cantidad:['10','1','2'][i],unidad:['bag','bigbag','roll'][i],
  rubro:'obra_gruesa',presentacion:['50 kg','1 m3','4 mm'][i],
  aclaracion:null,citaCantidad:['10','1','2'][i],
  citaProducto:['cemento CPC','arena fina','membrana'][i],
  citaPresentacion:['50 kg','1 m³','4 mm'][i]
 }))};
function response(payload){
 return new Response(JSON.stringify({status:'completed',output:[{
  type:'message',role:'assistant',content:[{
   type:'output_text',text:JSON.stringify(payload)
  }]
 }]}),{status:200});
}
test('V2: lectura única interpreta tres materiales sin segunda petición a OpenAI',async()=>{
 const names=[];
 const out=await interpretarConIaCentralV2D013({
  fuente:source,apiKey:'sk-'+'a'.repeat(25),model:'gpt-6-luna',
  fetchImpl:async(_url,init)=>{
   const req=JSON.parse(init.body);
   names.push(req.text.format.name);
   assert.equal(req.reasoning.effort,'high');
   assert.equal(req.store,false);assert.deepEqual(req.tools,[]);
   assert.ok(!JSON.stringify(req).includes('SEGUNDA LECTURA'));
   return response(first);
  }
 });
 assert.deepEqual(names,['cotironda_ai_central_lector_v2_d013']);
 assert.equal(out.estado,'listo_para_preparar',out.motivo);
 assert.deepEqual(out.pedido.articulos.map(x=>x.cantidad),['10','1','2']);
 assert.deepEqual(out.pedido.articulos.map(x=>x.evidencia),spans);
 assert.deepEqual(out.pedido.articulosEnRevision,[]);
 // Un modelo nunca puede agregar marca a la descripción comercial.
 assert.equal(out.pedido.articulos[2].descripcion,spans[2]);
 assert.equal(out.pedido.zona_entrega,'La Plata');
});
test('V2: cantidades verdaderas, presentaciones repetidas y sin vocabulario de productos',()=>{
 for(const [e,q,u,c,expected] of [
  ['10 bolsas de cemento de 10 kg','10','bag','10',true],
  ['1 bolsón de arena de 1 m³','1','bigbag','1',true],
  ['3 baldes de albañil de 10 litros','3','bucket','3',true],
  ['4 metros lineales de cable 2.5 mm2','4','m','4',true],
  ['250 mililitros de látex','250','ml','250',true],
  ['10 bolsas de cemento de 25 kg','25','bag','25',false],
  ['3 baldes de albañil de 10 litros','10','unit','10',false],
  ['1 m³ de arena','1','bigbag','1',false],
  ['8 kg de cal','8','bag','8',false],
  ['2 unidades de cable','4','unit','4',false]
 ]){
  assert.equal(cantidadAcreditadaLecturaUnicaD013(e,q,u,c),expected,e);
 }
});
test('V2: IA Central conserva cantidad propia y no inventa ciudad',()=>{
 const invalid=structuredClone(first);
 invalid.articulos[0].cantidad='10';
 invalid.articulos[0].citaCantidad='texto de cita no numérico';
 invalid.articulos=invalid.articulos.map(x=>({...x,
  inicio:source.indexOf(x.evidencia),fin:source.indexOf(x.evidencia)+x.evidencia.length
 }));
 const wrong=evaluarLecturaCentralUnicaD013(source,invalid);
 // La cita del modelo puede ser imperfecta: NO volver a interpretarla
 // con un parser; la cantidad de compra ya fue decidida por IA Central.
 assert.equal(wrong.estado,'listo_para_preparar');
 assert.equal(wrong.pedido.articulos[0].cantidad,'10');
 assert.equal(wrong.pedido.articulos[0].unidad,'bag');
 assert.equal(wrong.pedido.articulos[0].evidencia,spans[0]);
 const invented=structuredClone(invalid);
 invented.articulos[0].cantidad='10';
 invented.articulos[0].citaCantidad='10';
 invented.zona_entrega='Rosario';
 const city=evaluarLecturaCentralUnicaD013(source,invented);
 assert.equal(city.estado,'requiere_aclaracion');
 assert.equal(city.motivo,'zona_de_entrega_faltante');
});
test('V2: presentación no demostrada se descarta, original se preserva completo',()=>{
 const entry=structuredClone(first);
 entry.articulos[0].presentacion='500 kg';
 entry.articulos[0].citaPresentacion='50 kg';
 entry.articulos=entry.articulos.map(x=>({...x,
  inicio:source.indexOf(x.evidencia),fin:source.indexOf(x.evidencia)+x.evidencia.length
 }));
 const read=evaluarLecturaCentralUnicaD013(source,entry);
 assert.equal(read.estado,'listo_para_preparar');
 assert.equal(read.pedido.articulos[0].presentacion,'50 kg');
 // La salida 500 kg del modelo no se muestra como original: solo su cita.
 assert.equal(read.pedido.articulos[0].evidencia,spans[0]);
});
const snapshot={state:'catalogue_snapshot',localidad:'La Plata',
 proveedores:[
 {clave:'corralon_ailin',localidad:'La Plata',catalogoConfirmado:true,
 articulos:[{numero:1,descripcion:'Cemento CPC de 50 kg',
 familiaAnterior:'cemento_gris_obra',revisionAnterior:'curated_family'},
 {numero:2,descripcion:'Arena fina bolsón 1 m3',
 familiaAnterior:'arena_fina',revisionAnterior:'curated_family'}]},
 {clave:'corralon_nahuel',localidad:'La Plata',catalogoConfirmado:true,
 articulos:[{numero:1,descripcion:'Cemento CPC de 50 kg',
 familiaAnterior:'cemento_gris_obra',revisionAnterior:'curated_family'}]}
 ],proveedoresSinConfirmar:0};
test('V2: una lectura y un ruteo IA por SKU, sin lector de rubros ni corroborador',async()=>{
 const calls=[],db=[];
 const mock=async(_url,init)=>{
  const req=JSON.parse(init.body),name=req.text.format.name;
  calls.push(name);
  assert.equal(req.reasoning.effort,'high');
  if(name==='cotironda_ai_central_lector_v2_d013')return response(first);
  if(name==='cotironda_ruteo_catalogos_v2'){
   const input=JSON.parse(req.input[1].content[0].text.split('\n').slice(1).join('\n'));
   assert.deepEqual(input.pedido.articulos.map(x=>x.evidencia),spans);
   return response({propuestas:[
    {proveedor:'corralon_ailin',correspondencias:[
     {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
      explicacion:'Cemento expresado en catálogo'},
     {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
      explicacion:'Arena fina en bolsón declarada'}]},
    {proveedor:'corralon_nahuel',correspondencias:[
     {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
      explicacion:'Mismo cemento CPC 50 kg'}]}
   ]});
  }
  throw Error('ruta heredada invocada: '+name);
 };
 const plan=await planificarMensajeAutenticadoMvp220({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:source,autenticadoPorWebhook:true,
  apiKey:'sk-'+'a'.repeat(25),model:'gpt-6-luna',
  fetchImpl:mock,rpc:async(name)=>{
   db.push(name);
   return {data:snapshot,error:null};
  }
 });
 assert.equal(plan.estado,'plan_validado_sin_envio',plan.motivo);
 assert.deepEqual(calls,[
  'cotironda_ai_central_lector_v2_d013',
  'cotironda_ruteo_catalogos_v2'
 ]);
 assert.deepEqual(db,['cotironda_piloto_ia_catalogo_mvp220']);
 assert.deepEqual(plan.ruteo.propuestas.map(x=>x.proveedor),
  ['corralon_ailin','corralon_nahuel']);
 const prepared=armarPreparacionSombraMvp221({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:source,autenticadoPorWebhook:true,plan
 });
 assert.equal(prepared.estado,'plan_sql_listo',prepared.motivo);
 assert.equal(prepared.params.p_original_text,source);
 assert.equal(prepared.params.p_items.length,3);
 assert.equal(plan.whatsappEnviado,false);
});
test('V2: ningún comprador pasa por la doble lectura, V1 aislado del selector vivo',()=>{
 const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
 const client=read('../../src/domain/ia-central/cliente-openai-v2-d013.ts');
 const router=read('../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts');
 const catalog=read('../../src/domain/ia-central/catalogo-curado-v2-d013.ts');
 const live=read('../../scripts/piloto/v2-d016-whapi-overlay.mjs');
 const active=router.slice(router.indexOf('export async function proponerRuteoCatalogoConIAV2'),
  router.indexOf('const MAX_LOTES='));
 assert.doesNotMatch(client,/verifierInstructions|secondSchema|purpose:'verifier'/u);
 assert.doesNotMatch(active,/await corroborarSemanticaD013/u);
 assert.doesNotMatch(catalog,/fetch\(/u);
 assert.match(live,/const buyerWorker=procesarCompradorCentralV2D013/u);
 assert.match(live,/const zoneWorker=continuarZonaCentralV2D013/u);
});
