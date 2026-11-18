import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretarConIaCentralV2D013} from
 '../../src/domain/ia-central/cliente-openai-v2-d013.ts';
import {evaluarLecturaCentralUnicaD013,localizarEvidenciasV1} from
 '../../src/domain/ia-central/contrato-v2-d013.ts';
import {autorizarPropuestasCatalogoV2} from
 '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';

const buyer='Hola! Para La Plata preciso:\n'+
 '- 10 bolsas de cemento CPC de 50 kg\n'+
 '- 1 bolsón de arena fina de 1 m³\n'+
 '- 2 bolsones de piedra partida de 1 m³';
const evidencias=[
 '10 bolsas de cemento CPC de 50 kg',
 '1 bolsón de arena fina de 1 m³',
 'bolsones de piedra partida de 1 m³'
];
const data={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:evidencias.map((evidencia,i)=>({
  evidencia,descripcion:'descripción reescrita que no se debe usar',
  cantidad:['10','1','2'][i],unidad:['bag','bigbag','bigbag'][i],
  rubro:'obra_gruesa',presentacion:['50 kg','1 m³','1 m³'][i],
  aclaracion:null,
  citaCantidad:i===2?'dos bolsones de piedra':'un texto no numérico',
  citaProducto:['cemento CPC','arena fina','piedra partida'][i],
  citaPresentacion:['50 kg','1 m³','1 m³'][i]
 }))};
function api(data){
 return new Response(JSON.stringify({status:'completed',output:[{
  type:'message',role:'assistant',content:[{
   type:'output_text',text:JSON.stringify(data)}]
 }]}),{status:200});
}

test('D013 V2: tercer material con número ANTES de cita no cae por parser',async()=>{
 let calls=0;
 const result=await interpretarConIaCentralV2D013({
  fuente:buyer,apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
  fetchImpl:async(_url,init)=>{
   calls++;
   const body=JSON.parse(init.body);
   assert.equal(body.reasoning.effort,'high');
   assert.equal(body.store,false);
   assert.deepEqual(body.tools,[]);
   return api(data);
  }
 });
 assert.equal(calls,1,'una lectura sin verificador independiente');
 assert.equal(result.estado,'listo_para_preparar',result.motivo);
 assert.deepEqual(result.pedido.articulos.map(x=>x.cantidad),['10','1','2']);
 assert.deepEqual(result.pedido.articulos.map(x=>x.unidad),['bag','bigbag','bigbag']);
 assert.equal(result.pedido.articulos[2].evidencia,evidencias[2]);
 assert.equal(result.pedido.articulos[2].descripcion,evidencias[2]);
 assert.equal(result.pedido.articulos[2].presentacion,'1 m³');
 assert.equal(result.pedido.zona_entrega,'La Plata');
 assert.deepEqual(result.pedido.articulosEnRevision,[]);
});

test('D013 V2: imposible cruzar fuente y pedido ni usar texto de otro comprador',()=>{
 const located=localizarEvidenciasV1(buyer,data);
 assert.ok(located);
 const outside=structuredClone(located);
 outside.articulos[2].inicio=1;
 assert.equal(evaluarLecturaCentralUnicaD013(buyer,outside).estado,'rechazado');
 const cross=structuredClone(data);
 cross.articulos[2].evidencia='bolsones de mármol inventado';
 assert.equal(localizarEvidenciasV1(buyer,cross),null);
});
test('D013 V2: dudas de IA son la única aclaración comercial, sin inventar cantidad',()=>{
 const located=localizarEvidenciasV1(buyer,{...data,dudas:['Cantidad no expresada']});
 assert.ok(located);
 const result=evaluarLecturaCentralUnicaD013(buyer,located);
 assert.equal(result.estado,'requiere_aclaracion');
 assert.equal(result.motivo,'ia_central_solicita_aclaracion');
});
test('D013 V2: el broker NO usa segundo verificador de producto ni autoriza SKU falso',()=>{
 const router=readFileSync(new URL(
  '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts',
  import.meta.url),'utf8');
 const contract=readFileSync(new URL(
  '../../src/domain/ia-central/contrato-v2-d013.ts',
  import.meta.url),'utf8');
 const planner=readFileSync(new URL(
  '../../src/domain/ia-central/planificador-piloto-v2-d013.ts',
  import.meta.url),'utf8');
 const active=contract.slice(contract.indexOf('export function evaluarLecturaCentralUnicaD013'));
 assert.doesNotMatch(active,/cantidadAcreditadaLecturaUnicaD013|envaseUnicoAcreditadoD013|cantidadUnidadesLibresAcreditadaD013/u);
 assert.doesNotMatch(router,/verificarCorrespondenciaTecnicaD013/u);
 assert.doesNotMatch(planner,/enRevisionUnicos|ruteo_parcial_con_articulos_visibles/u);
 const pedido={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
  articulos:[{evidencia:evidencias[0],inicio:0,fin:evidencias[0].length,
   descripcion:evidencias[0],cantidad:'10',unidad:'bag',
   rubro:'obra_gruesa',presentacion:'50 kg',aclaracion:null}]};
 const prov=[{clave:'corralon_ailin',activo:true,consentido:true,
  localidades:['La Plata'],articulos:[{
   numero:1,descripcion:'Cemento CPC bolsa 50 kg',rubro:'obra_gruesa'}]}];
 const good=autorizarPropuestasCatalogoV2(pedido,prov,[{
  proveedor:'corralon_ailin',correspondencias:[{
   indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
   explicacion:'Consulta comercial sin confirmar stock'
  }]
 }]);
 assert.equal(good.estado,'ruteo_valido_para_preparacion');
 assert.equal(good.whatsappEnviado,false);
 assert.equal(good.propuestas[0].correspondencias[0].tipo,'alternativa_razonable');
 const nonexistent=autorizarPropuestasCatalogoV2(pedido,prov,[{
  proveedor:'corralon_ailin',correspondencias:[{
   indicePedido:0,numeroCatalogo:999,tipo:'producto_declarado',
   explicacion:'producto inventado'
  }]
 }]);
 assert.equal(nonexistent.estado,'requiere_revision');
 const optedOut=autorizarPropuestasCatalogoV2(pedido,
  [{...prov[0],consentido:false}],[{
   proveedor:'corralon_ailin',correspondencias:[{
    indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
    explicacion:'comercio sin consentimiento'
   }]
  }]);
 assert.equal(optedOut.estado,'requiere_revision');
});
