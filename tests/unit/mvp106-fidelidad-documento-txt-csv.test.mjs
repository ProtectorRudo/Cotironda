import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSupplierTextSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-text.ts';

const original=[
 '20 bolsas · Cemento CPC 50 kg · $ 9.500,00 x 20 = $ 190.000,00',
 '2 unidades · pallets vacíos · $ 7.000,00 x 2 = $ 14.000,00',
 '3 unidades · bolsones vacíos · $ 500,00 x 3 = $ 1.500,00',
 'Flete a obra · $ 12.000,00',
 'Descuento comercial · -$ 3.000,00',
 'IVA: incluido',
 'Total: $ 214.500,00'
].join('\n');
const draft={
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:null,total_declared:'$ 214.500,00',unanswered:[],
 lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:'$ 9.500,00',line_total:'$ 190.000,00',
   evidence_location:'Fila 1',ambiguity:null},
  {original_description:'pallets vacíos',quantity:'2',unit:'unidades',
   unit_price:'$ 7.000,00',line_total:'$ 14.000,00',
   evidence_location:'Fila 2',ambiguity:null},
  {original_description:'bolsones vacíos',quantity:'3',unit:'unidades',
   unit_price:'$ 500,00',line_total:'$ 1.500,00',
   evidence_location:'Fila 3',ambiguity:null},
  {original_description:'Flete a obra',quantity:null,unit:null,
   unit_price:null,line_total:'$ 12.000,00',
   evidence_location:'Fila 4',ambiguity:null},
  {original_description:'Descuento comercial',quantity:null,unit:null,
   unit_price:null,line_total:'-$ 3.000,00',
   evidence_location:'Fila 5',ambiguity:null},
  {original_description:'IVA: incluido',quantity:null,unit:null,
   unit_price:null,line_total:null,evidence_location:'Fila 6',ambiguity:null}
 ]
};
function fixture(text=original,mime='text/plain',bytes=new TextEncoder().encode(text)){
 return {mime,bytes,sha256:'a'.repeat(64)};
}
function quote(changes={}){return {...draft,...changes};}
test('MVP106 source bytes support intact pallets, bolsones, flete, negative discount, IVA and total',()=>{
 const r=checkSupplierTextSource(fixture(),quote());
 assert.equal(r.state,'source_text_covered');
 assert.equal(r.reason,'covered');
 assert.equal(r.lines,6);
 assert.equal(r.sourceSha256,'a'.repeat(64));
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.rankingAllowed,false);
 assert.equal(r.sourceVerified,false);
 assert.ok(!JSON.stringify(r).includes('Cemento'));
});
test('MVP106 malformed, unreadable and other binary formats fail closed',()=>{
 for(const mime of ['application/pdf','image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']){
  assert.equal(checkSupplierTextSource(fixture(original,mime),quote()).reason,
    'unsupported_format',mime);
 }
 assert.equal(checkSupplierTextSource(fixture('', 'text/plain',new Uint8Array([0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff])),quote()).reason,'invalid_source');
 assert.equal(checkSupplierTextSource(fixture(original.replace('pallets','pallets\u0000')),quote()).reason,'invalid_source');
});
test('MVP106 omissions, price changes, original order changes and invented fields are blocked',()=>{
 const cases=[
  {input:original.replace('2 unidades · pallets vacíos · $ 7.000,00 x 2 = $ 14.000,00\n',''),draft:quote(),reason:'unsupported_layout'},
  {input:original.replace('pallets vacíos','pallets de madera'),draft:quote(),reason:'line_not_found'},
  {input:original.replace('$ 12.000,00','$ 13.000,00'),draft:quote(),reason:'field_not_on_source'},
  {input:original.replace('-$ 3.000,00','$ 3.000,00'),draft:quote(),reason:'field_not_on_source'},
  {input:original.replace('20 bolsas','21 bolsas'),draft:quote(),reason:'uncovered_number'},
  {input:original.replace('IVA: incluido','IVA: sin incluir'),draft:quote(),reason:'line_not_found'},
  {input:original.replace('Total: $ 214.500,00','Total: $ 214.000,00'),draft:quote(),reason:'total_not_found'}
 ];
 for(const c of cases){
  const r=checkSupplierTextSource(fixture(c.input),c.draft);
  assert.equal(r.reason,c.reason,JSON.stringify(c));
 }
});
test('MVP106 rejects omitted economic terms, supplemental money and unaccounted numeric quantities',()=>{
 assert.equal(checkSupplierTextSource(fixture(original.replace('Flete a obra · $ 12.000,00','Flete a obra · $ 12.000,00 + $ 1.000,00')),quote()).reason,'uncovered_money');
 assert.equal(checkSupplierTextSource(fixture(original.replace('Flete a obra · $ 12.000,00','Flete a obra 2 unidades · $ 12.000,00')),quote()).reason,'uncovered_number');
 assert.equal(checkSupplierTextSource(fixture(original),quote({lines:draft.lines.slice(0,5)})).reason,'unsupported_layout');
});
test('MVP106 never makes contact-bearing source public and never accepts model uncertainties',()=>{
 for(const extra of ['Contacto: +54 9 221 555 1234','Mail: contacto@proveedor.com',
  'Whatsapp 221 550 1234','CUIT 30-12345678-9','Corralón López']){
  const contaminated=original.replace('IVA: incluido','IVA: incluido '+extra);
  assert.equal(checkSupplierTextSource(fixture(contaminated),quote()).reason,'unsafe_contact');
 }
 assert.equal(checkSupplierTextSource(fixture(),quote({unanswered:['No se ve un renglón']})).reason,'unresolved');
 const changed=[...draft.lines];changed[1]={...changed[1],ambiguity:'pallet retornable'};
 assert.equal(checkSupplierTextSource(fixture(),quote({lines:changed})).reason,'unresolved');
});
test('MVP106 supports CSV plaintext without weakening completeness',()=>{
 const r=checkSupplierTextSource(fixture(original,'text/csv'),quote());
 assert.equal(r.state,'source_text_covered');
});
