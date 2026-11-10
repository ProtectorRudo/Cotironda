import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirEconomiaCompradorMvp180 as summary}
 from '../../src/domain/resumen-economia-comprador-mvp180.ts';

const base=()=>({
 state:'economia_observada_sin_ranking',
 quotations:2,
 iva_not_informed:2,
 freight_not_informed:1,
 freight_to_agree:1,
 stock_unverified:2,
 payment_not_informed:1,
 net_unverified:2,
 delivery_unverified:2,
 minimum_unverified:2,
 ranking_allowed:false,
 price_comparable:false,
 contacts_revealed:false
});
const tracking=()=>({state:'waiting',can_open:true,
 offers:[{label:'Presupuesto 1',text:'A'},{label:'Presupuesto 2',text:'B'}]});
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp180_buyer_economic_summary.sql',import.meta.url),'utf8');

test('MVP180 projection: only 12 anonymous safe fields and no source identity',()=>{
 const f={...base(),source_hmac:'SECRET',supplier_key:'merchant',phone:'549999',
  declared_total:'310359.22',original_url:'https://private'};
 const actual=summary(tracking(),f);
 assert.ok(actual);
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(base()).sort());
 assert.equal(actual.iva_not_informed,2);
 assert.equal(actual.freight_to_agree,1);
 for(const secret of ['SECRET','merchant','549999','310359.22','private'])
  assert.equal(JSON.stringify(actual).includes(secret),false);
 assert.equal(actual.ranking_allowed,false);
});
test('MVP180 projection: no token, revocation, closure bypass or unauthorized data',()=>{
 for(const status of [null,undefined,
  {...tracking(),can_open:false},
  {...tracking(),state:'cancelled'},
  {...tracking(),state:'not_found'},
  {...tracking(),offers:[]},
  {...tracking(),offers:null}]){
  assert.equal(summary(status,base()),null);
 }
});
test('MVP180 projection: mismatched count is never presented for other candidates',()=>{
 for(const incoming of [
  {...base(),quotations:1},
  {...base(),quotations:3},
  {...base(),iva_not_informed:3},
  {...base(),stock_unverified:-1},
  {...base(),freight_to_agree:2},
  {...base(),payment_not_informed:null},
  {...base(),delivery_unverified:1.2},
  {...base(),net_unverified:'2'},
  {...base(),price_comparable:true},
  {...base(),ranking_allowed:true},
  {...base(),contacts_revealed:true},
  {...base(),state:'ranked'}
 ])assert.equal(summary(tracking(),incoming),null,JSON.stringify(incoming));
});
test('MVP180 projection: valid closed and zero gaps do not invent comparison',()=>{
 const gaps={...base(),iva_not_informed:0,freight_not_informed:0,
  freight_to_agree:0,stock_unverified:0,payment_not_informed:0,
  net_unverified:0,delivery_unverified:0,minimum_unverified:0};
 const r=summary({...tracking(),state:'closed'},gaps);
 assert.ok(r);assert.equal(r.price_comparable,false);
 assert.equal(r.iva_not_informed,0);
});
test('MVP180 SQL: privileged RPC repeats bearer validation and matches all visible texts',()=>{
 assert.match(sql,/cotironda_piloto_tracking_status_mvp091\(p_token_hash\)/);
 assert.match(sql,/tracking->>'can_open'<>'true'/);
 assert.match(sql,/t\.revoked_at is null/);
 assert.match(sql,/t\.expires_at>clock_timestamp\(\)/);
 assert.match(sql,/buyer\.opted_out_at is null/);
 assert.match(sql,/jsonb_agg\(off->>'text' order by off->>'text'\)/);
 assert.match(sql,/jsonb_agg\(public_text order by public_text\)/);
 assert.match(sql,/audited_texts<>expected_texts/);
 assert.match(sql,/distinct on \(supplier_key\)/);
 assert.match(sql,/e\.verifier_version=9/);
 assert.match(sql,/newer\.verifier_version>9/);
});
test('MVP180 SQL: private service-role only and no money, contacts, originals returned',()=>{
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/revoke all on function public\.cotironda_piloto_buyer_economy_summary_mvp180\(text\)[\s\S]*from public,anon,authenticated,service_role;/);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_buyer_economy_summary_mvp180\(text\)[\s\S]*to service_role;/);
 const returned=sql.slice(sql.lastIndexOf('return jsonb_build_object('));
 assert.doesNotMatch(returned,/supplier_key|message_hmac|source_sha256|original_url|public_text|phone|total_cents/);
 assert.match(returned,/'ranking_allowed',false/);
 assert.match(returned,/'price_comparable',false/);
 assert.match(returned,/'contacts_revealed',false/);
});
