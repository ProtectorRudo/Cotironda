import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cotejarPdfMonedaHistoricaB5k} from
 '../../src/domain/presupuestos-v2/worker-moneda-original-b5k.ts';
const id='d'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n'+'q'.repeat(240)+'\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const material=(ordinal,desc,qty,unit,total)=>({
 ordinal,kind:'material',
 original_line_raw:qty+' '+desc+' '+unit+' '+total,
 original_description_raw:desc,quantity_raw:qty,unit_raw:null,
 unit_price_raw:unit,unit_price_role:'effective_explicit',
 line_total_raw:total,source_location_raw:'página 1'
});
const candidate={
 document_kind:'supplier_quote',
 lines:[material(1,'Cemento CPC','40,00','$100,00','$4.000,00'),
  material(2,'Arena Big Bag','3,00','$200,00','$600,00')],
 total_declared_raw:'$4.600,00',currency_declared_raw:null,
 commercial_conditions_raw:[]
};
const claim={state:'claimed',source_hmac:id,source_sha256:sha,
 size_bytes:bytes.length,processor_version:'v2_b5m_20261111',
 historic_candidate:candidate};
const row=(y,parts)=>({page:1,y,parts,
 text:parts.map(x=>x.text).join(' ')});
const part=(text,x)=>({text,x});
const rows=[
 row(740,[part('Cant',20),part('Descripción',100),
  part('Unit',300),part('Total',500)]),
 row(700,[part('40,00',20),part('Cemento CPC',100),
  part('$100,00',300),part('$4.000,00',500)]),
 row(670,[part('3,00',20),part('Arena Big Bag',100),
  part('$200,00',300),part('$600,00',500)]),
 row(600,[part('$4.600,00',500)])
];
async function run({request=claim,readRows=rows,data=bytes,
 finish={state:'recorded'},brokenReader=false}={}){
 let stored;const calls=[];
 const outcome=await cotejarPdfMonedaHistoricaB5k({
  enabled:true,trustedInternalWorker:true,
  rpc:async(name,params={})=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_v2_currency_b5k')
    return {data:request,error:null};
   if(name==='cotironda_piloto_finish_v2_currency_b5k'){
    stored=params;return {data:finish,error:null};
   }
   throw Error('unexpected_rpc');
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'cotironda-piloto-originals');
   return {download:async path=>{
    assert.equal(path,'media/'+id);calls.push('download');
    return {data:new Blob([data]),error:null};
   }}
  }},
  readPdfEvidence:async b=>{
   calls.push('pdf');if(brokenReader)throw Error('private phone 2215558888');
   assert.deepEqual(b,bytes);
   return {pages:1,rows:readRows,scanned:false};
  }
 });
 return {outcome,calls,stored};
}
test('B5k: only SHA-checked originals produce private arithmetic codes',async()=>{
 const {outcome,calls,stored}=await run();
 assert.equal(outcome.state,'private_diagnosed');
 assert.deepEqual(calls,['cotironda_piloto_claim_v2_currency_b5k',
  'download','pdf','cotironda_piloto_finish_v2_currency_b5k']);
 assert.equal(stored.p_state,'private_diagnosed');
 assert.equal(stored.p_reason_code,'b5k_private_currency_diagnosis');
 assert.equal(stored.p_diagnostics.currency_code,'uniform_dollar_symbol_iso_unstated');
 assert.equal(stored.p_diagnostics.economic_code,'grand_total_balances_private');
 assert.equal(stored.p_diagnostics.iso_verified,false);
 assert.equal(stored.p_diagnostics.economic_material_matches,2);
 assert.equal(stored.p_diagnostics.coverage_code,'visible_rows_accounted_private');
 assert.equal(stored.p_diagnostics.coverage_source_rows,4);
 assert.equal(stored.p_diagnostics.coverage_unattributed_rows,0);
 assert.equal(stored.p_diagnostics.coverage_lines_matched,2);
 assert.equal(stored.p_diagnostics.source_verified,false);
 assert.equal(stored.p_diagnostics.can_publish,false);
 assert.equal(stored.p_diagnostics.can_rank,false);
 assert.equal(stored.p_diagnostics.full_document_covered,false);
 assert.equal(outcome.outboundMessages,0);
 assert.equal(outcome.publishedOffers,0);
 assert.ok(!JSON.stringify(stored.p_diagnostics).includes('4.600'));
});
test('B5k: private arithmetic mismatch does not authorize ranking',async()=>{
 const changed={...claim,historic_candidate:{
  ...candidate,total_declared_raw:'$4.601,00'
 }};
 const pdf=[...rows.slice(0,-1),row(600,[part('$4.601,00',500)])];
 const {outcome,stored}=await run({request:changed,readRows:pdf});
 assert.equal(outcome.state,'private_diagnosed');
 assert.equal(stored.p_diagnostics.economic_code,'grand_total_differs');
 assert.equal(stored.p_diagnostics.can_publish,false);
});
test('B5k: no active claim does not read a single byte',async()=>{
 const x=await run({request:{state:'empty'}});
 assert.equal(x.outcome.state,'empty');
 assert.deepEqual(x.calls,['cotironda_piloto_claim_v2_currency_b5k']);
});
test('B5k: corrupted original cannot be parsed',async()=>{
 const corrupted=Uint8Array.from(bytes);corrupted[180]^=1;
 const x=await run({data:corrupted});
 assert.equal(x.outcome.state,'review_required');
 assert.equal(x.stored.p_reason_code,'b5k_sha_mismatch');
 assert.ok(!x.calls.includes('pdf'));
});
test('B5k: missing item fails closed and avoids misleading economic output',async()=>{
 const x=await run({readRows:[rows[0],rows[1],rows[3]]});
 assert.equal(x.outcome.state,'review_required');
 assert.equal(x.stored.p_diagnostics,null);
});
test('B5k: parser failure cannot leak the source error',async()=>{
 const x=await run({brokenReader:true});
 assert.equal(x.outcome.state,'reconciliation_required');
 assert.equal(x.stored.p_diagnostics,null);
 assert.ok(!JSON.stringify(x.outcome).includes('2215558888'));
});
test('B5k: lost acknowledgement cannot be falsely recorded as success',async()=>{
 const x=await run({finish:{state:'not_leased'}});
 assert.equal(x.outcome.state,'reconciliation_required');
});
test('B5k: off flag forbids RPC, DB and original Storage reads',async()=>{
 let calls=0;
 const x=await cotejarPdfMonedaHistoricaB5k({
  enabled:false,trustedInternalWorker:true,
  rpc:async()=>{calls++;throw Error('forbidden')},
  storage:{from:()=>{calls++;throw Error('forbidden')}}
 });
 assert.equal(x.state,'disabled');assert.equal(calls,0);
});
test('B5k: forged source path rejected before Storage',async()=>{
 let reads=0;
 const x=await cotejarPdfMonedaHistoricaB5k({
  enabled:true,trustedInternalWorker:true,
  rpc:async()=>({data:{...claim,source_hmac:'../private'},error:null}),
  storage:{from:()=>{reads++;throw Error('forbidden')}}
 });
 assert.equal(x.reason,'claim_invalid');assert.equal(reads,0);
});

test('B5k: worker finish reason is accepted by the actual committed SQL contract',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_b5k_private_currency_source_versioned.sql',
  import.meta.url),'utf8');
 assert.ok(sql.includes(
  "p_reason_code<>'b5k_private_currency_diagnosis'"));
 assert.ok(sql.includes(
  "reason_code='b5k_private_currency_diagnosis'"));
 assert.ok(sql.includes(
  "ADD COLUMN b5k_only boolean NOT NULL DEFAULT false"));
 assert.ok(sql.includes("'coverage_code'"));
 assert.ok(sql.includes("visible_rows_accounted_private"));
});

test('B5l via B5k worker: invisible source total does not certify public completeness',async()=>{
 const {stored}=await run();
 assert.equal(stored.p_diagnostics.coverage_code,
  'visible_rows_accounted_private');
 assert.equal(stored.p_diagnostics.full_document_covered,false);
 assert.equal(stored.p_diagnostics.can_publish,false);
 assert.equal(stored.p_diagnostics.can_rank,false);
});
test('B5l via B5k worker: omitted cash price in an extra source row stays private',async()=>{
 const withUnmapped=[...rows,row(530,[part('Descuento en efectivo',120),part('$50,00',510)])];
 const x=await run({readRows:withUnmapped});
 assert.equal(x.outcome.state,'private_diagnosed');
 assert.equal(x.stored.p_diagnostics.coverage_code,'unmapped_fiscal_or_logistics');
 assert.equal(x.stored.p_diagnostics.full_document_covered,false);
 assert.equal(x.stored.p_diagnostics.can_publish,false);
});
