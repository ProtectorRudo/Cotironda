import test from 'node:test';
import assert from 'node:assert/strict';
import {resumirAlternativasCoberturaMvp189 as compute} from
 '../../src/domain/alternativas-cobertura-mvp189.ts';

const RID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const fmt=n=>'$ '+String(Math.floor(n/100))+','+String(n%100).padStart(2,'0');
const dec=n=>String(Math.floor(n/100))+'.'+String(n%100).padStart(2,'0');
const product={
 arena:{name:'BIG BAG de Arena',family:'arena_fina',itemId:'item_001'},
 piedra:{name:'BIG BAG de Piedra',family:'piedra_partida',itemId:'item_002'}
};
function quote(index,kinds=['arena','piedra']){
 const sha=String.fromCharCode(99+index).repeat(64);
 const hmac=String.fromCharCode(97+index).repeat(64);
 const lines=kinds.map((kind,j)=>({
  lineNo:j+1,descriptionLiteral:product[kind].name,
  quantityLiteral:'1,00',unitLiteral:null,unitPriceLiteral:fmt(12000+j*100),
  lineTotalLiteral:fmt(12000+j*100)
 }));
 const total=lines.reduce((n,x,j)=>n+(12000+j*100),0);
 return {
  publicText:'PUBLIC_APPROVED_'+index,
  doc:{
   requestId:RID,anonId:'anon_private',messageHmac:hmac,sourceSha256:sha,
   declaredTotalLiteral:fmt(total),lineas:lines,
   prueba:{requestId:RID,messageHmac:hmac,sourceSha256:sha,
    version:9,state:'verified',reason:'covered',lineCount:lines.length,
    sumLineCents:String(total),declaredTotalCents:String(total),
    rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
  },
  fuente:{requestId:RID,messageHmac:hmac,sourceSha256:sha,
   state:'source_checked',rankingAllowed:false,sourceImmutabilityPreserved:true,
   lines:lines.map(l=>({
    lineNo:l.lineNo,unitStatus:'not_explicit',unit:null,
    presentation:'big_bag',page:1,row:4+l.lineNo
   }))
  },
  economia:{state:'source_checked',sourceSha256:sha,rankingAllowed:false,
   descuentos:{estado:'descuentos_conciliados_sin_iva',rankingHabilitado:false,
    precios:lines.map((l,j)=>({
     linea:l.lineNo,pagina:1,fila:4+l.lineNo,
     estado:'importe_sin_ajuste_conciliado',
     descuentoPorcentaje:null,
     unitarioComercialTrasDescuento:dec(12000+j*100),
     ivaAcreditado:false
    }))
   },
   condiciones:{iva:{estado:'no_informado',tasa:null,ubicaciones:[]},
    flete:{estado:'a_convenir',importe:null,ubicaciones:[]},
    pago:{estado:'no_informado',ubicaciones:[]},
    rankingHabilitado:false,stockCorroborado:false}
  }
 };
}
const requestItems=[
 {id:'item_001',descripcionLiteral:'arena fina',cantidad:'1.000',unidad:'m3',familia:'arena_fina'},
 {id:'item_002',descripcionLiteral:'piedra partida',cantidad:'1.000',unidad:'m3',familia:'piedra_partida'}
];
const data=(kindsA=['arena'],kindsB=['piedra'])=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:structuredClone(requestItems),
 quotations:[quote(0,kindsA),quote(1,kindsB)]
});
const tracking=()=>({
 state:'closed',can_open:true,
 offers:[{label:'Presupuesto 1',text:'PUBLIC_APPROVED_1'},
         {label:'Presupuesto 2',text:'PUBLIC_APPROVED_0'}],
 economy:{state:'economia_observada_sin_ranking',quotations:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false},
 coverage:{state:'cobertura_revisada',quotations:2,requested_items:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false}
});
test('MVP189: dos presupuestos parciales complementarios -> una pareja comercial sin ganador',()=>{
 const r=compute(tracking(),data());
 assert.equal(r?.state,'alternativas_cobertura_sin_ranking');
 assert.deepEqual(r.coberturaPorOferta,[
  {oferta:'Presupuesto 1',articulosConAlternativa:1,articulosSolicitados:2},
  {oferta:'Presupuesto 2',articulosConAlternativa:1,articulosSolicitados:2}
 ]);
 assert.equal(r.alternativas.length,1);
 const p=r.alternativas[0];
 assert.equal(p.modo,'complementaria');
 assert.deepEqual(p.ofertasAnonimas,['Presupuesto 1','Presupuesto 2']);
 assert.deepEqual(p.articulos.map(x=>[x.itemId,...x.ofertasConAlternativa]),[
  ['item_001','Presupuesto 2'],['item_002','Presupuesto 1']
 ]);
 for(const key of ['ranking_allowed','price_comparable','tax_calculated',
  'freight_calculated','stock_confirmed','contacts_revealed',
  'automatic_award','finalists_selected','whatsapp_sent',
  'originals_downloadable'])assert.equal(r[key],false,key);
});
test('MVP189: oferta completa es individual; no inventar pareja redundante con parcial',()=>{
 const r=compute(tracking(),data(['arena','piedra'],['piedra']));
 assert.ok(r);
 assert.equal(r.alternativas.length,1);
 assert.equal(r.alternativas[0].modo,'individual');
 assert.deepEqual(r.alternativas[0].ofertasAnonimas,['Presupuesto 2']);
 assert.equal(r.coberturaPorOferta[0].articulosConAlternativa,1);
 assert.equal(r.coberturaPorOferta[1].articulosConAlternativa,2);
});
test('MVP189: ninguna pareja completa mantiene coberturas parciales y cero ganadores',()=>{
 const r=compute(tracking(),data(['arena'],['arena']));
 assert.ok(r);
 assert.equal(r.alternativas.length,0);
 assert.deepEqual(r.coberturaPorOferta.map(x=>x.articulosConAlternativa),[1,1]);
 assert.equal(r.automatic_award,false);
});
test('MVP189: silencio IVA e IVA incluido no impiden mostrar cobertura posible',()=>{
 const p=data();
 p.quotations[0].economia.condiciones.iva.estado='incluido';
 p.quotations[1].economia.condiciones.iva.estado='no_informado';
 const r=compute(tracking(),p);
 assert.ok(r);
 assert.equal(r.alternativas.length,1);
 assert.equal(r.tax_calculated,false);
 assert.equal(r.price_comparable,false);
});
test('MVP189: no anticipa combinaciones antes del cierre ni tras revocación',()=>{
 for(const mutate of [
  t=>{t.state='waiting'},t=>{t.state='cancelled'},
  t=>{t.can_open=false},t=>{t.economy=null},
  t=>{t.coverage=null},t=>{t.coverage.quotations=1},
  t=>{t.economy.quotations=1},t=>{t.economy.price_comparable=true},
  t=>{t.coverage.contacts_revealed=true},
  t=>{t.offers[0].text='NO_ES_LA_OFERTA_APROBADA'},
  t=>{t.offers[0].text=t.offers[1].text},
  t=>{t.offers[0].label=t.offers[1].label}
 ]){
  const t=tracking();mutate(t);
  assert.equal(compute(t,data()),null);
 }
});
test('MVP189: SHA/revisión y texto son obligatorios; fuente suplantada falla cerrada',()=>{
 for(const mutate of [
  p=>{p.quotations[0].doc.prueba.revisionVigente=false},
  p=>{p.quotations[0].doc.prueba.version=8},
  p=>{p.quotations[0].doc.sourceSha256='f'.repeat(64)},
  p=>{p.quotations[0].fuente.sourceSha256='f'.repeat(64)},
  p=>{p.quotations[0].economia.sourceSha256='f'.repeat(64)},
  p=>{p.quotations[0].doc.prueba.sumLineCents='42'},
  p=>{p.quotations[0].publicText=p.quotations[1].publicText},
  p=>{p.quotations[0].publicText='OFERTA_DE_OTRO_PROVEEDOR'},
  p=>{p.contactsRevealed=true},
  p=>{p.quotations.pop()}
 ]){
  const p=data();mutate(p);
  assert.equal(compute(tracking(),p),null);
 }
});
test('MVP189: resultado carece de fuente, moneda, precios, proveedor identificable y PII',()=>{
 const p=data(),r=compute(tracking(),p);
 assert.ok(r);
 const out=JSON.stringify(r);
 for(const secret of [
  RID,p.quotations[0].doc.messageHmac,p.quotations[1].doc.sourceSha256,
  'PUBLIC_APPROVED_0','BIG BAG','media/','supplier_key',
  'sourceSha256','precioUnitario','importeCotizado','phone','whatsapp_number'
 ])assert.ok(!out.includes(secret),secret);
 assert.equal(Object.isFrozen(r),true);
});
test('MVP189: no emite data si cobertura v9 no soporta el texto comercial',()=>{
 const p=data();
 p.quotations[0].doc.lineas[0].descriptionLiteral='Producto desconocido 123';
 const r=compute(tracking(),p);
 // The other quote still gives one partial; no full pair is fabricated.
 assert.ok(r);
 assert.equal(r.alternativas.length,0);
 assert.equal(r.coberturaPorOferta[1].articulosConAlternativa,0);
});
