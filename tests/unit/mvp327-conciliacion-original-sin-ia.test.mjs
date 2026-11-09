import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cotejarOriginalTextualMvp327} from
 '../../src/domain/ia-central/conciliacion-original-textual-mvp327.ts';

const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const H='a'.repeat(64),ID='11111111-1111-4111-8111-111111111111';
const line='20 bolsas cemento CPC 50 kg c/u AR$ 9000 total AR$ 180000';
function fixture(){
 const fuente='ARS\n'+line+'\nTotal general: AR$ 180000';
 return {
  snapshot:{
   requestId:ID,mensajeHmac:H,mensajeMasRecienteHmac:H,
   fuenteSha256:hash(fuente),fuenteMasRecienteSha256:hash(fuente),
   estadoRevision:'review',finalizadaEn:'2026-11-07T16:45:00Z',
   formato:'text',textoOriginal:fuente
  },
  proposal:{
   requestId:ID,
   pedido:[{id:'item_1',descripcion:'Cemento CPC 50 kg',
    rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}],
   oferta:{
    etiquetaAnonima:'Oferta interna de prueba',
    moneda:'ARS',iva:'no_informado',flete:'no_informado',
    pago:'no_informado',fuente,
    lineas:[{
     numero:1,textoOriginal:line,descripcion:'Cemento CPC 50 kg',
     cantidad:'20',unidad:'bag',
     precioUnitarioLiteral:'AR$ 9000',
     totalLineaLiteral:'AR$ 180000',tipo:'material'
    }],
    vinculos:[{
     lineaOferta:1,articuloPedido:'item_1',
     equivalencia:'misma_presentacion',
     explicacion:'El original exhibe la misma cantidad y unidad'
    }]
   }
  }
 };
}
const run=()=>{const f=fixture();return cotejarOriginalTextualMvp327(f.snapshot,f.proposal)};
const reconcileSource=x=>{
 x.snapshot.fuenteSha256=hash(x.snapshot.textoOriginal);
 x.snapshot.fuenteMasRecienteSha256=x.snapshot.fuenteSha256;
 x.proposal.oferta.fuente=x.snapshot.textoOriginal;
};
test('MVP327: candidate only for independent audit with source-matched line',async()=>{
 const c=await run();
 assert.equal(c.state,'candidato_para_auditoria_independiente');
 assert.equal(c.motivos.length,0);
 assert.equal(c.articulosCotejados,1);
 assert.equal(c.renglonesSinAsignar,0);
 assert.equal(c.sumatoriaMaterialesCentavos,'18000000');
 assert.equal(c.totalDeclaradoConciliado,true);
 assert.equal(c.moneda,'ARS');
 assert.equal(c.necesitaAprobacionHumana,true);
 assert.equal(c.permitirPublicacion,false);
 assert.equal(c.actualizarRevisionAnterior,false);
 assert.equal(c.automatico,false);
 assert.equal(c.llamadasModelo,0);
 assert.equal(c.whatsappEnviados,0);
 assert.doesNotMatch(JSON.stringify(c),/Oferta interna|Cemento CPC|messageHmac|supplier|sourceSha/u);
});
test('MVP327: edited bytes, source or wrong round fail custody',async()=>{
 const cases=[
  x=>{x.snapshot.textoOriginal=x.snapshot.textoOriginal.replace('ARS','ars')},
  x=>{x.snapshot.fuenteSha256='f'.repeat(64);x.snapshot.fuenteMasRecienteSha256='f'.repeat(64)},
  x=>{x.proposal.oferta.fuente=x.proposal.oferta.fuente.replace('9000','9001')},
  x=>{x.snapshot.formato='document'},
  x=>{x.snapshot.requestId='22222222-2222-4222-8222-222222222222'},
  x=>{x.snapshot.finalizadaEn='invalid date'},
  x=>{x.snapshot.estadoRevision='reserved'}
 ];
 for(const patch of cases){
  const x=fixture();patch(x);
  const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
  assert.equal(r.state,'requiere_evidencia');
  assert.equal(r.sumatoriaMaterialesCentavos,null);
  assert.equal(r.permitirPublicacion,false);
 }
});
test('MVP327: later quote version must shadow an old terminal review',async()=>{
 for(const field of ['mensajeMasRecienteHmac','fuenteMasRecienteSha256']){
  const x=fixture();x.snapshot[field]='f'.repeat(64);
  const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
  assert.equal(r.state,'requiere_evidencia');
  assert.deepEqual(r.motivos,['respuesta_superada_por_otra_version']);
 }
});
test('MVP327: contradictory total cannot be hidden by correct line amounts',async()=>{
 const x=fixture();
 x.snapshot.textoOriginal=x.snapshot.textoOriginal.replace('Total general: AR$ 180000','Total general: AR$ 179999');
 reconcileSource(x);
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.ok(r.motivos.includes('total_declarado_no_conciliado'));
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});
test('MVP327: multiple summary lines demand reconciliation, not fabricated final',async()=>{
 const x=fixture();x.snapshot.textoOriginal+='\nSubtotal: AR$ 180000';
 reconcileSource(x);
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});
test('MVP327: explicitly priced freight is never lost or silently ignored',async()=>{
 const x=fixture(),cargo='Flete: AR$ 3000';
 x.snapshot.textoOriginal=x.snapshot.textoOriginal.replace('Total general:',cargo+'\nTotal general:');
 reconcileSource(x);
 x.proposal.oferta.lineas.push({
  numero:2,textoOriginal:cargo,descripcion:'Flete',
  cantidad:null,unidad:null,
  precioUnitarioLiteral:null,totalLineaLiteral:'AR$ 3000',
  tipo:'cargo_adicional'
 });
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.ok(r.motivos.includes('cargos_adicionales_sin_comparacion'));
 assert.ok(r.motivos.includes('renglones_adicionales_o_no_asignados'));
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});
test('MVP327: changes to quantity/unit/price, mapping, currency cannot pass',async()=>{
 for(const patch of [
  x=>{x.proposal.oferta.lineas[0].cantidad='200'},
  x=>{x.proposal.oferta.lineas[0].unidad='unit'},
  x=>{x.proposal.oferta.lineas[0].precioUnitarioLiteral='AR$ 8000'},
  x=>{x.proposal.oferta.lineas[0].totalLineaLiteral='AR$ 270000'},
  x=>{x.proposal.oferta.vinculos[0].equivalencia='alternativa_razonable'},
  x=>{x.proposal.oferta.moneda='USD'}
 ]){
  const x=fixture();patch(x);
  const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
  assert.equal(r.state,'requiere_evidencia');
  assert.equal(r.sumatoriaMaterialesCentavos,null);
 }
});
test('MVP327: partial offer is not full order or final amount',async()=>{
 const x=fixture();
 x.proposal.pedido.push({id:'item_2',descripcion:'Arena en bolsón',
  rubro:'obra_gruesa',cantidad:'3',unidad:'m3'});
 x.snapshot.textoOriginal=x.snapshot.textoOriginal.replace('\nTotal general: AR$ 180000','');
 reconcileSource(x);
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'candidato_para_auditoria_independiente');
 assert.equal(r.totalDeclaradoConciliado,false);
 assert.equal(r.sumatoriaMaterialesCentavos,'18000000');
 assert.equal(r.permitirPublicacion,false);
});
test('MVP327: no unit-price evidence cannot create verified money',async()=>{
 const x=fixture(),wrong='20 bolsas cemento CPC 50 kg total AR$ 180000';
 x.snapshot.textoOriginal='ARS\n'+wrong;
 reconcileSource(x);
 x.proposal.oferta.lineas[0].textoOriginal=wrong;
 x.proposal.oferta.lineas[0].precioUnitarioLiteral=null;
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});
test('MVP327: claiming IVA included without proof is rejected',async()=>{
 const x=fixture();x.proposal.oferta.iva='incluido_explicito';
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.ok(r.motivos.includes('condicion_iva_sin_evidencia'));
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});

test('MVP327: even an unpriced extra product must never vanish from original',async()=>{
 const x=fixture();
 x.snapshot.textoOriginal+='\n10 bolsas de cal extra, sin precio';
 reconcileSource(x);
 const r=await cotejarOriginalTextualMvp327(x.snapshot,x.proposal);
 assert.equal(r.state,'requiere_evidencia');
 assert.ok(r.motivos.includes('lineas_de_fuente_sin_representacion'));
 assert.equal(r.sumatoriaMaterialesCentavos,null);
});
