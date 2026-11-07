import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirImportesCotizadosCompradorMvp186 as summarize} from
 '../../src/domain/resumen-importes-cotizados-mvp186.ts';

const RID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const amount=n=>'$ '+String(Math.floor(n/100))+','+String(n%100).padStart(2,'0');
const decimals=n=>String(Math.floor(n/100))+'.'+String(n%100).padStart(2,'0');

function quote(i,unitArena=10000,unitPiedra=10000){
 const sha=String(i?'d':'c').repeat(64);
 const hmac=String(i?'b':'a').repeat(64);
 const lines=[
  {lineNo:1,descriptionLiteral:'BIG BAG de Arena',
   quantityLiteral:'1,00',unitLiteral:null,
   unitPriceLiteral:amount(unitArena),lineTotalLiteral:amount(unitArena)},
  {lineNo:2,descriptionLiteral:'BIG BAG de Piedra',
   quantityLiteral:'2,00',unitLiteral:null,
   unitPriceLiteral:amount(unitPiedra),lineTotalLiteral:amount(2*unitPiedra)}
 ];
 const total=unitArena+2*unitPiedra;
 const facts=lines.map(x=>({lineNo:x.lineNo,unitStatus:'not_explicit',
  unit:null,presentation:'big_bag',page:1,row:x.lineNo+4}));
 return {
  publicText:'PUBLIC_REVIEWED_'+i,
  doc:{requestId:RID,anonId:'anon_private',sourceSha256:sha,
   messageHmac:hmac,declaredTotalLiteral:amount(total),lineas:lines,
   prueba:{requestId:RID,messageHmac:hmac,sourceSha256:sha,version:9,
    state:'verified',reason:'covered',lineCount:2,
    sumLineCents:String(total),declaredTotalCents:String(total),
    rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
  },
  fuente:{requestId:RID,messageHmac:hmac,sourceSha256:sha,
   state:'source_checked',rankingAllowed:false,sourceImmutabilityPreserved:true,
   lines:facts
  },
  economia:{state:'source_checked',sourceSha256:sha,rankingAllowed:false,
   descuentos:{
    estado:'descuentos_conciliados_sin_iva',
    rankingHabilitado:false,precios:lines.map(x=>({
     linea:x.lineNo,pagina:1,fila:x.lineNo+4,
     estado:'importe_sin_ajuste_conciliado',descuentoPorcentaje:null,
     unitarioComercialTrasDescuento:decimals(x.lineNo===1?unitArena:unitPiedra),
     ivaAcreditado:false
    }))
   },
   condiciones:{
    iva:{estado:'no_informado',tasa:null,ubicaciones:[]},
    flete:{estado:'a_convenir',importe:null,ubicaciones:[]},
    pago:{estado:'no_informado',ubicaciones:[]},
    rankingHabilitado:false,stockCorroborado:false
   }
  }
 };
}
const sample=()=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:[
  {id:'item_001',descripcionLiteral:'arena fina',cantidad:'1.000',
   unidad:'m3',familia:'arena_fina'},
  {id:'item_002',descripcionLiteral:'piedra partida',cantidad:'2.000',
   unidad:'m3',familia:'piedra_partida'}
 ],
 quotations:[quote(0),quote(1,9000,9500)]
});
const tracking=()=>({
 state:'waiting',can_open:true,
 // Deliberately REVERSED: public order != SQL source order by HMAC.
 offers:[
  {label:'Presupuesto 1',text:'PUBLIC_REVIEWED_1'},
  {label:'Presupuesto 2',text:'PUBLIC_REVIEWED_0'}
 ],
 economy:{state:'economia_observada_sin_ranking',quotations:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false}
});
test('MVP186: la fuente v9 se vincula por texto público exacto, NUNCA por índice de HMAC',()=>{
 const r=summarize(tracking(),sample());
 assert.equal(r?.state,'importes_por_articulo_sin_ranking');
 assert.equal(r.quotations,2);
 assert.equal(r.requested_items,2);
 assert.deepEqual(r.articulos.map(x=>({
  descripcion:x.descripcionSolicitada,cantidad:x.cantidadSolicitada,
  unidad:x.unidadSolicitada
 })),[
  {descripcion:'arena fina',cantidad:'1.000',unidad:'m3'},
  {descripcion:'piedra partida',cantidad:'2.000',unidad:'m3'}
 ]);
 assert.deepEqual(r.articulos[0].referencias.map(x=>x.cantidadCotizadaLiteral),
  ['1,00','1,00']);
 assert.deepEqual(r.articulos[1].referencias.map(x=>x.cantidadCotizadaLiteral),
  ['2,00','2,00']);
 assert.deepEqual(r.articulos.map(x=>x.referencias.map(y=>y.oferta)),[
  ['Presupuesto 1','Presupuesto 2'],['Presupuesto 1','Presupuesto 2']
 ]);
 assert.deepEqual(r.articulos[0].referencias.map(x=>x.importeCotizado),
  ['$ 90,00','$ 100,00']);
 assert.deepEqual(r.articulos[1].referencias.map(x=>x.importeCotizado),
  ['$ 190,00','$ 200,00']);
 assert.equal(r.articulos[0].referencias[0].iva,'sin_iva_por_convencion');
 assert.equal(r.ranking_allowed,false);
 assert.equal(r.price_comparable,false);
 assert.equal(r.IVA_calculado,false);
 assert.equal(r.flete_calculado,false);
 assert.equal(r.stock_confirmado,false);
 assert.equal(r.adjudicacion,false);
 assert.equal(r.originales_descargables,false);
 assert.equal(r.contacts_revealed,false);
});
test('MVP186: los proveedores no completan nuevos formularios ni confirman IVA silencioso',()=>{
 const data=sample(),before=structuredClone(data);
 const r=summarize(tracking(),data);
 assert.deepEqual(data,before);
 assert.equal(r?.articulos.length,2);
 assert.equal(r?.articulos[0].referencias[0].estado,'alternativa_comercial_con_aclaracion');
});
test('MVP186: la transcripción aprobada y su orden no pueden mezclarse con otra fuente',()=>{
 for(const change of [
  x=>x.quotations[0].publicText='TEXTO_NO_APROBADO',
  x=>x.quotations[1].publicText=x.quotations[0].publicText,
  x=>delete x.quotations[0].publicText,
  x=>x.quotations.pop(),
  x=>x.quotations[0].doc.requestId='otra_ronda',
  x=>x.quotations[0].fuente.sourceSha256='f'.repeat(64),
  x=>x.quotations[0].economia.sourceSha256='f'.repeat(64),
  x=>x.quotations[0].doc.prueba.revisionVigente=false,
  x=>x.quotations[0].doc.prueba.cotizacionVigente=false,
  x=>x.quotations[0].doc.prueba.version=8
 ]){
  const p=sample();change(p);
  assert.equal(summarize(tracking(),p),null);
 }
});
test('MVP186: no emite datos si tracking está revocado, sin permiso o desactualizado',()=>{
 for(const s of [
  null,{...tracking(),can_open:false},
  {...tracking(),state:'cancelled'},
  {...tracking(),state:'not_found'},
  {...tracking(),offers:[]},
  {...tracking(),economy:null},
  {...tracking(),economy:{...tracking().economy,quotations:1}},
  {...tracking(),economy:{...tracking().economy,price_comparable:true}},
  {...tracking(),economy:{...tracking().economy,contacts_revealed:true}},
  {...tracking(),offers:[...tracking().offers].reverse().map(o=>({...o,text:'PUBLIC_REVIEWED_0'}))}
 ])assert.equal(summarize(s,sample()),null);
 assert.ok(summarize({...tracking(),state:'closed'},sample()));
});
test('MVP186: contradicción o IVA incluido no homologado retiene oferta, sin precio de base ficticio',()=>{
 for(const value of ['incluido','contradictorio','tasa_sin_base']){
  const p=sample();p.quotations[0].economia.condiciones.iva.estado=value;
  const r=summarize(tracking(),p);
  assert.ok(r);
  // RPC source index 0 is Presupuesto 2; the visible list starts at 1.
  assert.equal(r.articulos[0].referencias[0].oferta,'Presupuesto 1');
  assert.equal(r.articulos[0].referencias[0].importeCotizado,'$ 90,00');
  assert.equal(r.articulos[0].referencias[1].oferta,'Presupuesto 2');
  assert.equal(r.articulos[0].referencias[1].importeCotizado,null);
  assert.equal(r.articulos[0].referencias[1].estado,'no_homologable');
 }
});
test('MVP186: ubicación de fuente ausente invalida la proyección sin filtrar importes',()=>{
 const p=sample();
 p.quotations[0].fuente.lines[0].page=null;
 // The line no longer has the same independently accredited page/row as
 // the source discount auditor. Do not silently publish a different amount.
 assert.equal(summarize(tracking(),p),null);
});
test('MVP186: verificador descarta adulteración de precios, cantidades y posición original',()=>{
 for(const modify of [
  x=>x.quotations[0].economia.descuentos.precios[0].fila=999,
  x=>x.quotations[0].economia.descuentos.precios[0].unitarioComercialTrasDescuento='999.00',
  x=>x.quotations[0].doc.lineas[0].quantityLiteral='4',
  x=>x.quotations[0].doc.lineas[0].lineTotalLiteral='$ 95,00',
  x=>x.quotations[0].economia.descuentos.precios[0].estado='descuento_ambiguo'
 ]){
  const p=sample();modify(p);
  assert.equal(summarize(tracking(),p),null);
 }
});
test('MVP186: originales, proveedor, SHA, HMAC y el texto usado para mapear jamás van al navegador',()=>{
 const data=sample();const r=summarize(tracking(),data);
 const output=JSON.stringify(r);
 for(const secret of [
  data.quotations[0].doc.sourceSha256,
  data.quotations[0].doc.messageHmac,
  RID,'PUBLIC_REVIEWED_0','BIG BAG','supplier_key','media/','sourceSha256'
 ])assert.ok(!output.includes(secret),secret);
 assert.deepEqual(Object.keys(r).sort(),[
  'state','quotations','requested_items','articulos',
  'ranking_allowed','price_comparable','contacts_revealed',
  'adjudicacion','originales_descargables','IVA_calculado',
  'flete_calculado','stock_confirmado'
 ].sort());
});
test('MVP186: SQL mantiene token y permisos service_role y vincula texto aprobado',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/mvp172_private_round_inputs.sql',import.meta.url),'utf8');
 const gate=readFileSync(new URL(
  '../../supabase/piloto/mvp175_buyer_coverage_token_gated.sql',import.meta.url),'utf8');
 assert.match(sql,/'publicText',e\.public_text/);
 assert.match(sql,/e\.state='verified' and e\.reason='covered'/);
 assert.match(sql,/e\.public_text is not null/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.match(gate,/t\.token_hash=p_token_hash/);
 assert.match(gate,/t\.revoked_at is null/);
 assert.match(gate,/t\.expires_at>v_now/);
 assert.match(gate,/buyer\.consent_at is not null/);
 assert.match(gate,/buyer\.opted_out_at is null/);
});
test('MVP186: Edge y proxy nunca envían el insumo privado en crudo',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
 const proxy=readFileSync(new URL(
  '../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
 assert.match(edge,/verifiedRoundInputs=source\.data/);
 assert.match(edge,/resumirImportesCotizadosCompradorMvp186/);
 assert.match(edge,/if\(itemPrices\)\s*\{\s*publicResult=\{\.\.\.publicResult,item_prices:itemPrices\}/);
 assert.doesNotMatch(edge,/item_prices:verifiedRoundInputs|item_prices:source\.data/);
 assert.match(proxy,/safe\.item_prices=\{/);
 assert.doesNotMatch(proxy,/safe\.item_prices=p;/);
 assert.match(proxy,/new Set\(row\.referencias\.map\(ref=>ref\.oferta\)\)/);
});

test('MVP187: el contexto del comprador no sustituye cantidades del proveedor',()=>{
 const p=sample();
 p.requestItems[0].descripcionLiteral='Arena gruesa - equivalente a considerar';
 p.requestItems[0].cantidad='15.000';
 const result=summarize(tracking(),p);
 assert.ok(result);
 assert.equal(result.articulos[0].descripcionSolicitada,
   'Arena gruesa - equivalente a considerar');
 assert.equal(result.articulos[0].cantidadSolicitada,'15.000');
 assert.equal(result.articulos[0].referencias[0].cantidadCotizadaLiteral,null);
 assert.equal(result.articulos[0].referencias[0].importeCotizado,null);
 assert.equal(result.articulos[0].referencias[0].estado,'sin_importe_asignable');
 assert.equal(result.price_comparable,false);
});

test('MVP187: nunca incluir nombre de comercio, HMAC ni datos de fuente en el contexto del comprador',()=>{
 const p=sample(),result=summarize(tracking(),p);
 assert.ok(result);
 const out=JSON.stringify(result);
 for(const sensitive of [RID,p.quotations[0].doc.messageHmac,
   p.quotations[1].doc.sourceSha256,p.quotations[0].publicText,
   'BIG BAG de Piedra'])
  assert.ok(!out.includes(sensitive),sensitive);
 assert.equal(result.contactosRevelados,undefined);
 assert.equal(result.contacts_revealed,false);
});

test('MVP206: misma referencia y precio aunque cambie el orden interno de HMAC',()=>{
 const t=tracking();
 const original=sample();
 const reverse=structuredClone(original);
 reverse.quotations.reverse();
 const a=summarize(t,original),b=summarize(t,reverse);
 assert.ok(a&&b);
 assert.deepEqual(a,b);
 assert.deepEqual(a.articulos.map(item=>item.referencias.map(x=>x.oferta)),[
  ['Presupuesto 1','Presupuesto 2'],['Presupuesto 1','Presupuesto 2']
 ]);
});

test('MVP206: dos textos aprobados con una etiqueta de presupuesto repetida se rechazan',()=>{
 const t=tracking();t.offers[1].label=t.offers[0].label;
 assert.equal(summarize(t,sample()),null);
});
