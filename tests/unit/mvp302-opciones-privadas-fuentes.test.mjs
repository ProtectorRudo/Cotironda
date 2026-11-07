import test from 'node:test';
import assert from 'node:assert/strict';
import {propuestasFuentesVerificadasMvp302 as project} from
 '../../src/domain/ia-central/propuestas-fuentes-privadas-mvp302.ts';

const base={
 state:'private_verified_sources',
 requested_item_ids:['item_1','item_2','item_3'],
 candidates:[
  {label:'Presupuesto 1',supplier_key:'corralon_ailin',
   message_hmac:'a'.repeat(64),source_sha256:'b'.repeat(64),
   item_ids:['item_1','item_2'],moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado'},
  {label:'Presupuesto 2',supplier_key:'corralon_nahuel',
   message_hmac:'c'.repeat(64),source_sha256:'d'.repeat(64),
   item_ids:['item_3'],moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado'}
 ],
 ranking_allowed:false,automatic_award:false,contacts_revealed:false,
 whatsapp_sent:false,manual_award_required:true
};
const copy=()=>structuredClone(base);

test('MVP302: dos fuentes SQL verificadas por distintos rubros: cobertura complementaria',()=>{
 const r=project(copy());
 assert.equal(r.estado,'opciones_para_aprobacion_manual');
 assert.equal(r.fuentesValidas,2);
 assert.equal(r.opciones.length,1);
 assert.equal(r.opciones[0].modo,'complementaria');
 assert.deepEqual(r.opciones[0].ofertasAnonimas,
  ['Presupuesto 1','Presupuesto 2']);
 assert.equal(r.opciones[0].articulosCubiertos,3);
 assert.equal(r.opciones[0].condicionesHomogeneas,true);
 for(const k of ['rankingGlobalPermitido','ganadorElegido',
  'adjudicacionAutomatica','contactosRevelados','mensajesEnviados'])
  assert.equal(r[k],false);
 assert.equal(r.aprobacionManualRequerida,true);
 assert.doesNotMatch(JSON.stringify(r),
  /corralon_|message_hmac|source_sha256|sender|telefono|precio|whapi|centavos|@s\\.whatsapp\\.net|221[0-9]{7}/i);
});
test('MVP302: dos fuentes completas alternativas no son dos ganadores',()=>{
 const c=copy();
 c.candidates[0].item_ids=['item_1','item_2','item_3'];
 c.candidates[1].item_ids=['item_1','item_2','item_3'];
 const r=project(c);
 assert.equal(r.opciones.length,2);
 assert.ok(r.opciones.every(x=>x.modo==='individual'));
 assert.equal(r.ganadorElegido,false);
});
test('MVP302: dos fuentes sin artículo 3 no se convierten en cobertura completa',()=>{
 const c=copy();
 c.candidates[1].item_ids=['item_2'];
 const r=project(c);
 assert.equal(r.estado,'sin_cobertura_total');
 assert.equal(r.opciones.length,0);
});
test('MVP302: distintas condiciones se muestran, no se suman precios',()=>{
 const c=copy();
 c.candidates[1].flete='a_convenir';
 const r=project(c);
 assert.equal(r.opciones[0].condicionesHomogeneas,false);
 assert.equal(r.ganadorElegido,false);
});
test('MVP302: sin fuentes no hay propuesta',()=>{
 const c=copy();c.state='no_verified_sources';c.candidates=[];
 assert.equal(project(c).estado,'fuentes_ausentes');
});
test('MVP302: datos inyectados, otros proveedores y estados falsos fallan cerrado',()=>{
 const changes=[
  c=>{c.contacts_revealed=true},
  c=>{c.ranking_allowed=true},
  c=>{c.manual_award_required=false},
  c=>{c.candidates[0].phone='5492210000000'},
  c=>{c.candidates[0].precio='1'},
  c=>{c.candidates[1].supplier_key=c.candidates[0].supplier_key},
  c=>{c.candidates[1].message_hmac=c.candidates[0].message_hmac},
  c=>{c.candidates[1].label=c.candidates[0].label},
  c=>{c.candidates[1].item_ids=['item_500']},
  c=>{c.candidates[1].item_ids=['item_3','item_3']},
  c=>{c.candidates[1].source_sha256='altered'},
  c=>{c.candidates[1].moneda='no_informada'},
  c=>{c.state='prepared'},
  c=>{c.candidates=[]},
  c=>{c.requested_item_ids=['item_1','item_1']}
 ];
 for(const change of changes){
  const c=copy();change(c);
  assert.equal(project(c).estado,'insumos_invalidos',JSON.stringify(c).slice(0,95));
 }
});
