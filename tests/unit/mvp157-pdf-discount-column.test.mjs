import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySupplierEvidence} from '../../supabase/functions/cotironda-piloto-whapi/supplier-evidence-mvp138.ts';
const H='a'.repeat(64);
const file={mime:'application/pdf',bytes:new Uint8Array(128).fill(5),sha256:H};
const make=(rate,extended)=>{
 const q=['1,00','2,00','25,00'],names=['BIG BAG de Arena','BIG BAG de Piedra','cemento avellaneda x 25 kg'];
 const price=['$1.000,00','$1.000,00','$100,00'];
 return {status:'review_required',kind:'supplier_quote',delivery_city:null,
  requested_delivery_note:null,unanswered:[],
  total_declared:rate==='22.4'?'$4.268,00':'$5.500,00',
  lines:names.map((name,i)=>({original_description:name+'; Dscto.'+(rate==='0.0'?': ':' ')+rate+'%',
    quantity:q[i],unit:null,unit_price:price[i],line_total:extended[i],
    ambiguity:null,evidence_location:'Página 1'}))
 };
};
const ailin=make('22.4',['$776,00','$1.552,00','$1.940,00']);
const nahuel=make('0.0',['$1.000,00','$2.000,00','$2.500,00']);
const rows=(rate,amounts,total)=>[
 'ITEM CANT DESCRIPCION DSCTO SUBTOTAL',
 '1,00 BIG BAG de Arena $1.000,00 '+rate+'% '+amounts[0],
 '2,00 BIG BAG de Piedra $1.000,00 '+rate+'% '+amounts[1],
 '25,00 cemento avellaneda x 25 kg $100,00 '+rate+'% '+amounts[2],
 'TOTAL '+total,
 'Dscto. '+rate+'%'
];
test('MVP157: tres líneas de Ailín con Dscto en columna, con aritmética y fuente visible',async()=>{
 const source=rows('22,4',['$776,00','$1.552,00','$1.940,00'],'$4.268,00');
 const result=await verifySupplierEvidence(file,ailin,async()=>source);
 assert.deepEqual(result,{state:'verified',reason:'covered',lines:3});
});
test('MVP157: tres líneas de Nahuel con Dscto. 0.0% sin inventar descuentos',async()=>{
 const source=rows('0,0',['$1.000,00','$2.000,00','$2.500,00'],'$5.500,00');
 const result=await verifySupplierEvidence(file,nahuel,async()=>source);
 assert.equal(result.state,'verified',JSON.stringify(result));
});
test('MVP157: porcentaje de borrador no basta si el original lo omite o está alterado',async()=>{
 const correct=rows('22,4',['$776,00','$1.552,00','$1.940,00'],'$4.268,00');
 const invalid=[
  correct.map(x=>x.replaceAll('22,4','99,9')),
  correct.filter(x=>!x.includes('Dscto.')).map(x=>x.replaceAll('22,4%','')),
  correct.map(x=>x.replace('$776,00','$775,00')),
  correct.filter(x=>!x.includes('TOTAL')),
  [...correct,'FLETE $2.000,00']
 ];
 for(const value of invalid){
  const result=await verifySupplierEvidence(file,ailin,async()=>value);
  assert.equal(result.state,'needs_source_review',JSON.stringify(result));
 }
});
test('MVP157: variantes no declaradas no se inventan y la proyección sigue privada',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp157_supplier_discount_evidence_v9.sql',import.meta.url),'utf8');
 assert.match(sql,/e.verifier_version=9/u);
 assert.match(sql,/values\(p_message_hmac,9,/u);
 assert.match(sql,/e.verifier_version between 2 and 9/u);
 assert.match(sql,/from public,anon,authenticated;/u);
 assert.match(sql,/to service_role;/u);
 assert.doesNotMatch(sql,/delete from|truncate|alter table .* disable|update .*supplier_evidence/iu);
});
