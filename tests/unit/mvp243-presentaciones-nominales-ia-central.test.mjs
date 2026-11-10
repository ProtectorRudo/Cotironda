import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticarPresentacionMvp243 as cotejar} from
 '../../src/domain/ia-central/diagnostico-presentaciones-mvp243.ts';
import {evaluarCotizacionMvp225,compararPorRubroMvp225} from
 '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
import {procesarPresupuestoCentralMvp227} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';

const pedido=(descripcion,cantidad,unidad='bag',id='item_1')=>({
 id,descripcion,cantidad,unidad,rubro:'obra_gruesa'
});
const linea=(textoOriginal,cantidad,unidad='bag')=>({
 numero:1,descripcion:'Alternativa comercial',textoOriginal,cantidad,unidad,
 precioUnitarioLiteral:null,totalLineaLiteral:null,tipo:'material'
});
const link=(equivalencia='alternativa_razonable')=>({
 lineaOferta:1,articuloPedido:'item_1',equivalencia,
 explicacion:'El producto se propone como alternativa comercial'
});
const quote=(line,equivalencia='alternativa_razonable')=>({
 etiquetaAnonima:'Oferta anónima',fuente:line.textoOriginal+'\nMoneda: ARS',
 moneda:'ARS',iva:'no_informado',flete:'no_informado',pago:'no_informado',
 lineas:[line],vinculos:[link(equivalencia)]
});

test('MVP243: 20 bolsas x 50 kg y 40 bolsas x 25 kg acreditan SOLO 1000 kg nominales',()=>{
 const item=pedido('cemento CPC 50 kg','20');
 const offered=linea('40 bolsas de cemento Avellaneda x 25kg','40');
 const result=cotejar(item,offered);
 assert.equal(result.estado,'cantidad_nominal_igual');
 assert.equal(result.unidadBase,'kg');
 assert.equal(result.pedidoBaseMil,'1000000');
 assert.equal(result.ofertaBaseMil,'1000000');
 assert.equal(result.comparableTecnico,false,'marca/clase requieren corroboración');
 assert.equal(result.comparableEconomico,false,'nunca habilitar precio automático');
 const r=evaluarCotizacionMvp225([item],quote(offered));
 assert.equal(r.presentaciones.length,1);
 assert.equal(r.presentaciones[0].estado,'cantidad_nominal_igual');
 assert.equal(r.rubros[0].cobertura,'completa');
 assert.equal(r.rubros[0].precioComprobado,0);
 assert.equal(r.precios.length,0);
 assert.equal(r.estado,'requiere_revision');
 assert.ok(r.motivos.includes('sin_precios_comparables'));
});
test('MVP243: 20 bolsas de 25 kg NO equivalen en cantidad a 20 de 50',()=>{
 const r=cotejar(pedido('cemento 50 kg','20'),
  linea('20 bolsas cemento gris 25 kg','20'));
 assert.equal(r.estado,'cantidad_nominal_diferente');
 assert.equal(r.pedidoBaseMil,'1000000');
 assert.equal(r.ofertaBaseMil,'500000');
});
test('MVP243: 5 litros pedidos vs un envase 5 L, solo físico',()=>{
 const r=cotejar(pedido('hidrófugo líquido','5','l'),
  linea('1 bidón de hidrófugo 5 L','1','unit'));
 assert.equal(r.estado,'cantidad_nominal_igual');
 assert.equal(r.unidadBase,'l');
 assert.equal(r.pedidoBaseMil,'5000');
 assert.equal(r.ofertaBaseMil,'5000');
 assert.equal(r.comparableTecnico,false);
});
test('MVP243: 4 L vs 5 L conserva excedente sin fingir mismo volumen',()=>{
 const r=cotejar(pedido('látex interior','4','l'),
  linea('1 lata de pintura látex 5 litros','1','unit'));
 assert.equal(r.estado,'cantidad_nominal_diferente');
 assert.equal(r.pedidoBaseMil,'4000');
 assert.equal(r.ofertaBaseMil,'5000');
});
test('MVP243: hidrófugo en pasta sin volumen queda sin acreditar',()=>{
 const r=cotejar(pedido('hidrófugo 5 litros','5','l'),
  linea('5 unidades hidrófugo en pasta','5','unit'));
 assert.equal(r.estado,'presentacion_sin_acreditar');
 assert.equal(r.pedidoBaseMil,null);
});
test('MVP243: bolsón sin m³ no prueba volumen nominal',()=>{
 const item=pedido('arena 3 metros cúbicos','3','m3');
 assert.equal(cotejar(item,linea('3 bolsones arena','3','unit')).estado,
  'presentacion_sin_acreditar');
 const yes=cotejar(item,linea('3 bolsones arena 1 m³ cada uno','3','unit'));
 assert.equal(yes.estado,'cantidad_nominal_igual');
 assert.equal(yes.unidadBase,'m3');
 assert.equal(yes.comparableEconomico,false);
});
test('MVP243: peso nominal no prueba identidad de árido/pintura',()=>{
 const r=cotejar(pedido('arena 50 kg','1','bag'),
  linea('1 bolsa piedra 50 kg','1','bag'));
 assert.equal(r.estado,'cantidad_nominal_igual');
 assert.equal(r.comparableTecnico,false);
 assert.equal(r.comparableEconomico,false);
});
test('MVP243: unidades base incompatibles nunca convierten kg a L',()=>{
 const r=cotejar(pedido('producto sellador 5 litros','5','l'),
  linea('1 bolsa de polvo sellador 5 kg','1','bag'));
 assert.equal(r.estado,'base_incompatible');
 assert.equal(r.unidadBase,null);
});
test('MVP243: precio o tamaño de envase no justifican cantidad de bultos inventada',()=>{
 const r=cotejar(pedido('cemento 50 kg','20'),
  linea('cemento CPC 25 kg; unitario $40.000','40','bag'));
 assert.equal(r.estado,'presentacion_sin_acreditar');
 assert.equal(r.pedidoBaseMil,null);
});
test('MVP243: varios tamaños distintos en un renglón quedan pendientes',()=>{
 const r=cotejar(pedido('cemento 50 kg','20'),
  linea('40 bolsas cemento 25 kg / 30 kg según stock','40','bag'));
 assert.equal(r.estado,'presentacion_sin_acreditar');
});
test('MVP243: alternativas no desplazan otra línea correctamente cotejada',()=>{
 const item1=pedido('cemento CPC 50 kg','20');
 const item2=pedido('cinta aisladora','2','unit','item_2');
 const first={...linea('40 bolsas cemento 25 kg','40'),
   precioUnitarioLiteral:'$7.603,70',totalLineaLiteral:'$304.148,00',
   textoOriginal:'40 bolsas cemento 25 kg $7.603,70 c/u total $304.148,00'};
 const second={...linea('2 cintas aisladoras $1.200 c/u total $2.400','2','unit'),
   numero:2,precioUnitarioLiteral:'$1.200',totalLineaLiteral:'$2.400'};
 const q={...quote(first),lineas:[first,second],
  fuente:first.textoOriginal+'\n'+second.textoOriginal+'\nMoneda: ARS',
  vinculos:[link(),{lineaOferta:2,articuloPedido:'item_2',
   equivalencia:'misma_presentacion',explicacion:'La cinta y unidad coinciden'}]};
 const result=evaluarCotizacionMvp225([item1,item2],q);
 assert.equal(result.presentaciones.length,1);
 assert.equal(result.precios.length,1);
 assert.equal(result.precios[0].pedidoId,'item_2');
 assert.equal(result.precios[0].centavos,240000n);
 assert.equal(result.rubros[0].respondidos,2);
 assert.equal(result.estado,'verificada_para_comparacion');
 const comparison=compararPorRubroMvp225([item1,item2],[q,q]);
 assert.equal(comparison.comparables[0].situacion,'sin_base_suficiente',
  'la alternativa de cemento nunca entra al ranking');
 assert.equal(comparison.comparables[1].situacion,'importe_linea_comparable',
  'un renglón independiente y exacto conserva comparabilidad');
});
test('MVP243: el resumen privado mantiene cantidad física pero no importa precio alternativo',async()=>{
 const item=pedido('cemento CPC 50 kg','20');
 const text='40 bolsas cemento Avellaneda x 25 kg $7.603,70 c/u total $304.148,00';
 const source={...linea(text,'40'),
  precioUnitarioLiteral:'$7.603,70',totalLineaLiteral:'$304.148,00'};
 const original=text+'\nMoneda: ARS';
 const ofrecida=quote(source);
 const read={estado:'interpretada_para_revision',motivo:'condiciones_pendientes_de_verificacion',
  oferta:ofrecida,
  cobertura:compararPorRubroMvp225([item],[ofrecida])};
 const calls=[];
 const hash='a'.repeat(64);
 const result=await procesarPresupuestoCentralMvp227({
  habilitado:true,webhookAutenticado:true,messageHmac:'b'.repeat(64),
  chatHmac:'c'.repeat(64),model:'gpt-6-luna',apiKey:'sk-test',
  decrypt:async()=>original,shaText:async()=>hash,
  interpretar:async()=>read,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
    return {data:{state:'reserved',source_sha256:hash,
      nonce:'encrypted_nonce',ciphertext:'ciphertext',
      items:[item]},error:null};
   if(name==='cotironda_piloto_ia_finish_quote_mvp227')
    return {data:{state:'saved_private'},error:null};
   throw Error('Unexpected RPC');
  }
 });
 assert.equal(result.estado,'requiere_revision');
 const summary=calls.at(-1).params.p_summary;
 assert.equal(calls.at(-1).params.p_state,'review');
 assert.equal(summary.presentaciones.length,1);
 assert.equal(summary.presentaciones[0].estado,'cantidad_nominal_igual');
 assert.equal(summary.presentaciones[0].comparableTecnico,false);
 assert.equal(summary.presentaciones[0].comparableEconomico,false);
 assert.deepEqual(summary.precios,[],'sin precios de alternativa');
 assert.equal(JSON.stringify(summary).includes(original),false);
});
