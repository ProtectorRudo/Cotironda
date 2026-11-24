import test from 'node:test';
import assert from 'node:assert/strict';
import {
 descripcionFuenteV2D013,armarPreparacionSombraMvp221
} from '../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';
import {procesarCompradorCentralMvp226 as procesarV2,
 codigoRevisionPuenteV2D013} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-v2-d013.ts';

const H='a'.repeat(64),M='b'.repeat(64),SHA='c'.repeat(64);
const original=['Hola, necesito cotizar estos materiales:',
 '- 10 bolsas de cemento CPC de 50 kg.',
 '- 1 bolsón de arena fina de 1 m³.',
 '- 1 bolsón de piedra partida de 1 m³.',
 'Entrega en La Plata, Buenos Aires.','Gracias.'].join('\n');
const citas=['10 bolsas de cemento CPC de 50 kg.',
 '1 bolsón de arena fina de 1 m³',
 '1 bolsón de piedra partida de 1 m³.'];
const item=(text,cita,unit='bag',qty='1')=>{
 const inicio=text.indexOf(cita);
 return {descripcion:'Descripción interpretada sin valor de fuente',
  evidencia:cita,inicio,fin:inicio+cita.length,cantidad:qty,
  unidad:unit,rubro:'obra_gruesa'};
};
const articulos=[
 item(original,citas[0],'bolsas','10'),
 item(original,citas[1],'bolson','1'),
 item(original,citas[2],'bigbag','1')
];
const cat=[
 {clave:'corralon_ailin',consentido:true,activo:true,
  articulos:[
   {numero:1,descripcion:'Cemento CPC 50 kg',rubro:'obra_gruesa'},
   {numero:2,descripcion:'Arena fina en bolsón',rubro:'obra_gruesa'},
   {numero:3,descripcion:'Piedra partida en bolsón',rubro:'obra_gruesa'}]},
 {clave:'corralon_nahuel',consentido:true,activo:true,
  articulos:[{numero:1,descripcion:'Cemento equivalente 50 kg',rubro:'otros'}]}
];
const plan={
 estado:'plan_validado_sin_envio',whatsappEnviado:false,baseModificada:false,
 pedido:{zona_entrega:'La Plata, Buenos Aires',articulos},
 ruteo:{estado:'ruteo_valido_para_preparacion',propuestas:[
  {proveedor:'corralon_ailin',correspondencias:[0,1,2].map(i=>({
   indicePedido:i,numeroCatalogo:i+1,tipo:'producto_declarado',
   explicacion:'Coincidencia por producto real del catálogo'
  }))},
  {proveedor:'corralon_nahuel',correspondencias:[{
   indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
   explicacion:'Consulta técnica sin equivalencia confirmada'
  }]}
 ]},
 catalogos:cat
};
const preparar=(fuente=original,p=plan)=>armarPreparacionSombraMvp221({
 chatHmac:H,messageHmac:M,textoOriginal:fuente,
 autenticadoPorWebhook:true,plan:p
});

test('V2: cita con punto final y lista con guiones no bloquea pedido real',()=>{
 const out=preparar();
 assert.equal(out.estado,'plan_sql_listo',out.motivo);
 assert.equal(out.params.p_original_text,original);
 assert.equal(out.params.p_city,'La Plata');
 assert.equal(out.params.p_items.length,3);
 assert.deepEqual(out.params.p_items.map(x=>x.descripcion),[
  'bolsas de cemento CPC de 50 kg',
  'bolsón de arena fina de 1 m³',
  'bolsón de piedra partida de 1 m³'
 ]);
 assert.deepEqual(out.params.p_items.map(x=>[x.cantidad,x.unidad]),[
  ['10','bag'],['1','bag'],['1','bag']
 ]);
 assert.equal(out.params.p_destinos.length,2);
 assert.deepEqual(out.params.p_destinos[0].correspondencias
  .map(x=>x.indicePedido),[0,1,2]);
 assert.equal(out.params.p_destinos[1].correspondencias[0].tipo,
  'alternativa_razonable');
});

test('V2: el dato original admite especificaciones extensas y Unicode',()=>{
 const specs='modelo industrial reforzado de acero inoxidable '.repeat(3)+
  ' medida 25 mm y junta de silicona 🔩';
 const text='1 '+specs+'; entrega en La Plata';
 const quote=text.slice(0,text.indexOf(';'));
 const got=descripcionFuenteV2D013(text,item(text,quote));
 assert.ok(got?.length>75,got);
 assert.ok(got?.includes('25 mm'),got);
 assert.ok(got?.includes('🔩'),got);
 assert.equal(got?.startsWith('modelo industrial'),true);
});

test('V2: admite producto de una palabra; no necesita un formato ni longitud PDF',()=>{
 const text='1 cemento. Entrega en La Plata';
 const got=descripcionFuenteV2D013(text,item(text,'1 cemento.'));
 assert.equal(got,'cemento');
 const text2='* 2 pinturas color marfil con terminación antihumedad';
 const got2=descripcionFuenteV2D013(text2,item(text2,
  '2 pinturas color marfil con terminación antihumedad','unit','2'));
 assert.equal(got2,'pinturas color marfil con terminación antihumedad');
});

test('V2: cita desanclada, renglón enorme o contacto privado no pasan',()=>{
 const safe='10 bolsas cemento CPC 50 kg';
 const good=item(safe,safe);
 assert.equal(descripcionFuenteV2D013(safe,{...good,inicio:1,fin:safe.length+1}),null);
 assert.equal(descripcionFuenteV2D013(safe,{...good,evidencia:'10 bolsas inventadas'}),null);
 const long='1 '+('cemento especificado '.repeat(40));
 assert.equal(descripcionFuenteV2D013(long,item(long,long)),null);
 for(const leak of [
  '2 bolsas cemento hablar al +54 221 555 0101',
  '2 bolsas cemento contacto obra@correo.com',
  '2 bolsas cemento ver https://ejemplo.com'
 ])assert.equal(descripcionFuenteV2D013(leak,item(leak,leak)),
  null,'bloquear datos de contacto');
});

test('V2: catálogo alterado y cantidad ajena a la fuente no se publican',()=>{
 const corrupted=structuredClone(plan);
 corrupted.catalogos[0].consentido=false;
 assert.equal(preparar(original,corrupted).estado,'plan_no_verificable');
 const broken=structuredClone(plan);
 broken.pedido.articulos[0].evidencia='10 bolsas cemento inventado';
 assert.equal(preparar(original,broken).motivo,'presentacion_fuente_no_representable');
 const unit=structuredClone(plan);
 unit.pedido.articulos[1].unidad='litros_de_agua_sin_dimensión';
 assert.equal(preparar(original,unit).motivo,
  'cantidad_unidad_no_representable_en_sql');
});

test('V2: motivo de rechazo es una clave fija y no filtra texto privado',()=>{
 assert.equal(codigoRevisionPuenteV2D013('presentacion_fuente_no_representable'),
  'presentacion_fuente_no_representable');
 assert.equal(codigoRevisionPuenteV2D013('contacto secreto 221...'),
  'plan_not_verifiable');
});

test('V2: ante plan inseguro, no invoca shadow SQL ni liberación ni WhatsApp',async()=>{
 const wrong=structuredClone(plan);
 wrong.pedido.articulos[0].evidencia='producto que no existe';
 const calls=[];
 const rpc=async(name,params)=>{
  calls.push([name,params]);
  if(name==='cotironda_piloto_ia_reserve_buyer_mvp226')
   return {data:{state:'reserved'},error:null};
  if(name==='cotironda_piloto_ia_finish_buyer_mvp226')
   return {data:{state:'finished'},error:null};
  throw Error('No se permite procesar ni publicar en una prueba negativa');
 };
 const response=await procesarV2({
  habilitado:true,publicar:false,autenticadoPorWebhook:true,
  chatHmac:H,messageHmac:M,sourceSha256:SHA,fuente:original,
  apiKey:'sk-test',model:'gpt-6-luna',rpc,
  planificar:async()=>wrong
 });
 assert.equal(response.estado,'requiere_revision');
 assert.equal(response.codigo,'presentacion_fuente_no_representable');
 assert.equal(response.whatsappEnviado,false);
 assert.deepEqual(calls.map(x=>x[0]),[
  'cotironda_piloto_ia_reserve_buyer_mvp226',
  'cotironda_piloto_ia_finish_buyer_mvp226'
 ]);
 assert.equal(calls[1][1].p_reason,'presentacion_fuente_no_representable');
});
