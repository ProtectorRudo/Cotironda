import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkSupplierImageSourceMvp251} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-image-mvp251.ts';

const bytes=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8,9,10,11,12]);
const digest=async b=>Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const media=async (mime='image/jpeg',data=bytes)=>({
  bytes:data,sha256:await digest(data),mime
});
const quote={
 status:'review_required', kind:'supplier_quote', delivery_city:null,
 requested_delivery_note:'Moneda ARS, flete a convenir',
 lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:'AR$ 8.000',line_total:'AR$ 160.000',
   evidence_location:'foto, fila 1',ambiguity:null},
  {original_description:'Flete',quantity:null,unit:null,
   unit_price:null,line_total:'AR$ 12.000',
   evidence_location:'foto, fila 2',ambiguity:null}
 ],
 total_declared:'AR$ 172.000',unanswered:[]
};
const expectReview = r => {
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.sourceVerified,false);
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.rankingAllowed,false);
};

test('MVP251: dos lecturas visuales idénticas NO acreditan el original ni publican importes',async()=>{
 const m=await media(),second=structuredClone(quote);
 const r=await checkSupplierImageSourceMvp251(m,quote,second);
 expectReview(r);
 assert.equal(r.reason,'unsupported_layout');
 assert.equal(r.lines,2);
 assert.equal(r.sourceSha256,m.sha256);
});

test('MVP251: un solo lector, campo borroso y renglón omitido quedan en revisión',async()=>{
 const m=await media();
 for(const second of [
  null,{...quote,unanswered:['precio poco legible']},
  {...quote,lines:quote.lines.slice(0,1)},
  {...quote,lines:[{...quote.lines[0],line_total:'AR$ 180.000'},quote.lines[1]]},
  {...quote,requested_delivery_note:'Moneda ARS, flete incluido'},
  {...quote,total_declared:'AR$ 174.000'},
  {...quote,lines:[{...quote.lines[0],quantity:'2'},quote.lines[1]]},
  {...quote,lines:[{...quote.lines[0],unit:'unidades'},quote.lines[1]]}
 ]){
  const r=await checkSupplierImageSourceMvp251(m,quote,second);
  expectReview(r);
  assert.equal(r.reason,'unresolved');
 }
});

test('MVP251: jamás se considera fuente verificada una imagen con hash o firma falsa',async()=>{
 const m=await media();
 const wrong={...m,sha256:'a'.repeat(64)};
 const badSignature=await media('image/jpeg',new Uint8Array(16).fill(1));
 for(const source of [wrong,badSignature,{...m,bytes:bytes.slice(0,4)}]){
  const r=await checkSupplierImageSourceMvp251(source,quote,quote);
  expectReview(r);
  assert.equal(r.reason,'invalid_source');
 }
});

test('MVP251: JPEG, PNG y WebP usan el mismo cierre de privacidad',async()=>{
 const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4,5]);
 const webp=new Uint8Array([0x52,0x49,0x46,0x46,1,2,3,4,0x57,0x45,0x42,0x50]);
 for(const source of [
  await media('image/jpeg'),await media('image/png',png),
  await media('image/webp',webp)
 ]){
  const r=await checkSupplierImageSourceMvp251(source,quote,quote);
  expectReview(r);
  assert.equal(r.reason,'unsupported_layout');
 }
 const wrong=await checkSupplierImageSourceMvp251(
  {...await media(),mime:'application/pdf'},quote,quote);
 expectReview(wrong);
 assert.equal(wrong.reason,'unsupported_format');
});

test('MVP251: identidades y teléfonos no se filtran en una propuesta visual',async()=>{
 const m=await media();
 for(const changed of [
  {...quote,requested_delivery_note:'llamar al 221 1234 WhatsApp'},
  {...quote,lines:[{...quote.lines[0],
   original_description:'Cemento CUIT 30-12345678-1'},quote.lines[1]]},
  {...quote,lines:[{...quote.lines[0],
   evidence_location:'Contacto proveedor calle 123'},quote.lines[1]]}
 ]){
  const r=await checkSupplierImageSourceMvp251(m,changed,changed);
  expectReview(r);
  assert.equal(r.reason,'unsafe_contact');
 }
});

test('MVP251: ingesta y recuperación aplican el mismo diagnóstico conservador',()=>{
 const dir=new URL('../../supabase/functions/cotironda-piloto-whapi/',import.meta.url);
 for(const name of ['index.ts','private-document-recovery.ts']){
  const text=readFileSync(new URL(name,dir),'utf8');
  assert.match(text,/checkSupplierImageSourceMvp251/);
  assert.match(text,/mime\.startsWith\('image\/'\)/);
 }
});
