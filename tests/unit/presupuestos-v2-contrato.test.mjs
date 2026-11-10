import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SUPPLIER_QUOTE_V2_SCHEMA,revisarContratoProveedorV2
} from '../../src/domain/presupuestos-v2/contrato-lectura.ts';

const row=(ordinal,kind='material',changes={})=>({
 ordinal,kind,
 original_line_raw:'2 bolsones arena $ 40.000,00',
 original_description_raw:'Bolsón de arena',
 quantity_raw:'2',
 unit_raw:null,
 unit_price_raw:'$ 20.000,00',
 unit_price_role:'effective_explicit',
 line_total_raw:'$ 40.000,00',
 source_location_raw:'página 1, fila 4',
 ...changes
});
const quote=(rows=[row(1),row(2,'commercial_note',{
 original_line_raw:'Entrega a convenir',
 original_description_raw:'Entrega a convenir',
 quantity_raw:null,unit_raw:null,unit_price_raw:null,
 unit_price_role:'absent',line_total_raw:null
})])=>({
 document_kind:'supplier_quote',
 lines:rows,
 total_declared_raw:null,
 currency_declared_raw:null,
 commercial_conditions_raw:['IVA no informado en fuente','Pago a convenir']
});
test('Cotironda V2: conserva literal PDF, cantidad sin unidad y condiciones sin inferir',()=>{
 const original=quote();
 const r=revisarContratoProveedorV2(original);
 assert.equal(r.state,'private_extract');
 assert.equal(r.code,'schema_ok');
 assert.equal(r.document,original);
 assert.equal(r.document.lines[0].unit_raw,null);
 assert.equal(r.document.total_declared_raw,null);
 assert.deepEqual(r.line_diagnostics.map(x=>x.ordinal),[1,2]);
 assert.ok(!('can_publish' in r)&&!('ranking_allowed' in r));
});
test('Cotironda V2: un importe dudoso deja los otros renglones visibles en privado',()=>{
 const q=quote([
  row(1),row(2,'material',{line_total_raw:null,unit_price_role:'list_explicit'}),
  row(3,'additional_charge',{
   original_line_raw:'Flete $ 4.000,00',
   original_description_raw:'Flete',quantity_raw:null,unit_raw:null,
   unit_price_role:'absent',unit_price_raw:null,
   line_total_raw:'$ 4.000,00'
  })
 ]);
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'private_extract');
 assert.equal(r.document.lines.length,3);
 assert.deepEqual(r.line_diagnostics.map(x=>x.state),[
  'extracted_pending_source_check','needs_field_review',
  'extracted_pending_source_check'
 ]);
 assert.equal(r.line_diagnostics[1].reason,'commercial_amount_missing');
 assert.equal(r.document.lines[1].unit_price_role,'list_explicit');
});
test('Cotironda V2: precio de lista distinto de total queda literal, sin dividir ni inventar descuento',()=>{
 const q=quote([row(1,'material',{
  unit_price_raw:'$ 48.000,00',unit_price_role:'list_explicit',
  line_total_raw:'$ 72.000,00',
  original_line_raw:'2 bolsas de cemento: precio lista 48 mil, total contado 72 mil'
 })]);
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.document.lines[0].unit_price_raw,'$ 48.000,00');
 assert.equal(r.document.lines[0].line_total_raw,'$ 72.000,00');
 assert.equal(r.document.lines[0].unit_price_role,'list_explicit');
 assert.equal(r.line_diagnostics[0].reason,'field_present_not_source_verified');
});
test('Cotironda V2: Excel conserva hoja/celda, descuentos, extra y tres decimales crudos',()=>{
 const q=quote([
  row(1,'material',{source_location_raw:'Hoja1!B7:G7',quantity_raw:'1,250'}),
  row(2,'discount',{
   source_location_raw:'Hoja1!B8',original_line_raw:'Bonificación -$ 1.200',
   original_description_raw:'Bonificación',unit_price_role:'absent',
   unit_price_raw:null,quantity_raw:null,line_total_raw:'-$ 1.200'
  }),
  row(3,'commercial_note',{
   source_location_raw:'Hoja1!B9',original_description_raw:'IVA según factura',
   original_line_raw:'IVA según factura',quantity_raw:null,unit_raw:null,
   unit_price_raw:null,unit_price_role:'absent',line_total_raw:null
  })
 ]);
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'private_extract');
 assert.equal(r.document.lines.length,3);
 assert.equal(r.document.lines[0].quantity_raw,'1,250');
 assert.equal(r.document.lines[1].line_total_raw,'-$ 1.200');
});
test('Cotironda V2: legibilidad baja no elimina renglones ni finge fuente',()=>{
 const q=quote([row(1),row(2,'material',{
  original_description_raw:'',source_location_raw:null,unit_price_raw:null,
  unit_price_role:'absent',line_total_raw:null
 })]);
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'private_extract');
 assert.deepEqual(r.line_diagnostics.map(x=>x.reason),[
  'field_present_not_source_verified','description_missing'
 ]);
});
test('Cotironda V2: una cita de ubicación ausente obliga a revisar solo esa línea',()=>{
 const q=quote([row(1),row(2,'material',{source_location_raw:null})]);
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'private_extract');
 assert.deepEqual(r.line_diagnostics.map(x=>x.reason),[
  'field_present_not_source_verified','location_missing'
 ]);
});
test('Cotironda V2: no omite columnas ni permite campos inventados del modelo',()=>{
 const valid=row(1);
 for(const invalid of [
  {...valid,quantity_raw:undefined},
  {...valid,other_hallucinated:'extra'},
  {...valid,kind:'unsupported'},
  {...valid,ordinal:0},
  {...valid,unit_price_role:'absent',unit_price_raw:'$ 123'},
  {...valid,source_location_raw:42},
  {...valid,original_description_raw:'line\u0000bad'}
 ]){
  const q=quote([invalid]);
  assert.equal(revisarContratoProveedorV2(q).state,'invalid_structure');
 }
});
test('Cotironda V2: 501 filas nunca se truncan silenciosamente',()=>{
 const q=quote(Array.from({length:501},(_,i)=>row(i+1)));
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'invalid_structure');
 assert.equal(r.code,'line_count_exceeds_limit');
});
test('Cotironda V2: orden, índices y filas repetidas se validan sin reassociar',()=>{
 const q=quote([row(1),row(3)]);
 assert.equal(revisarContratoProveedorV2(q).code,'invalid_line_shape');
 assert.equal(revisarContratoProveedorV2(quote([row(1),row(1)])).state,
  'invalid_structure');
});
test('Cotironda V2: no presupone moneda, IVA, stock, forma de pago ni flete',()=>{
 const q=quote([row(1)]);
 q.currency_declared_raw=null;
 q.commercial_conditions_raw=[];
 const r=revisarContratoProveedorV2(q);
 assert.equal(r.state,'private_extract');
 assert.equal(r.document.currency_declared_raw,null);
 assert.deepEqual(r.document.commercial_conditions_raw,[]);
});
test('Cotironda V2: estructura JSON estricta sin códigos de publicación o identificación',()=>{
 const s=SUPPLIER_QUOTE_V2_SCHEMA;
 assert.equal(s.type,'object');
 assert.equal(s.additionalProperties,false);
 assert.equal(s.properties.lines.items.additionalProperties,false);
 assert.ok(s.required.every(x=>Object.hasOwn(s.properties,x)));
 assert.ok(s.properties.lines.items.required.every(x=>
  Object.hasOwn(s.properties.lines.items.properties,x)));
 const schema=JSON.stringify(s);
 for(const forbidden of ['contact_phone','supplier_identity','can_publish',
  'ranking_allowed','buyer_phone','source_sha256']){
  assert.ok(!schema.includes(forbidden));
 }
});
test('Cotironda V2: documento de otra clase debe aislarse en revisión privada',()=>{
 for(const value of [null,{},[],{...quote(),document_kind:'buyer_request'},
  {...quote(),total_declared_raw:123},
  {...quote(),commercial_conditions_raw:['bien',7]},
  {...quote(),tracking_token:'unsafe'}]){
  assert.equal(revisarContratoProveedorV2(value).state,'invalid_structure');
 }
});
