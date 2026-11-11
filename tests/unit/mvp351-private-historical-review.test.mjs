import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {elegirRondaUnicaMvp291,correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';
import {buildMvp351Sql} from '../../scripts/piloto/mvp351-review-retry-builder.mjs';

const live='11111111-1111-4111-8111-111111111111';
const old='22222222-2222-4222-8222-222222222222';
const sha='c'.repeat(64),sourceHmac='a'.repeat(64),chatHmac='b'.repeat(64);
const quote=[{line_no:1,description:'Cemento',quantity:'15',unit:null},
 {line_no:2,description:'Arena BIG BAG',quantity:'2',unit:null},
 {line_no:3,description:'Piedra BIG BAG',quantity:'1',unit:null}];
const toRequest=(id,values,bind_allowed)=>({request_id:id,bind_allowed,lines:
 values.map((qty,i)=>({line_no:i+1,description:quote[i].description,
  quantity:String(qty),unit:'bag'}))});
const liveMatch=toRequest(live,[15,2,1],true);
const oldMismatch=toRequest(old,[20,3,3],false);
const liveMismatch=toRequest(live,[20,3,3],true);
const oldMatch=toRequest(old,[15,2,1],false);
const evidence=(candidate)=>({matches:quote.map((x,i)=>({
 candidate,source_line:i+1,request_line:i+1,relation:'equivalent'
}))});
test('MVP351: coincide 15/2/1 con ronda activa, frente a rival historico',()=>{
 const s={quote,options:[liveMatch,oldMismatch]};
 const result=elegirRondaUnicaMvp291(s,evidence('r1'),evidence('r1'));
 assert.equal(result.requestId,live);
 assert.equal(result.reason,'unique_material_evidence');
 assert.deepEqual(result.scores,[6,0]);
});
test('MVP351: aun si antiguo encaja mejor, JAMAS se le vincula',()=>{
 const s={quote,options:[liveMismatch,oldMatch]};
 const result=elegirRondaUnicaMvp291(s,evidence('r2'),evidence('r2'));
 assert.equal(result.requestId,null);
 assert.equal(result.reason,'historical_round_best_fit');
 assert.deepEqual(result.scores,[0,6]);
});
test('MVP351: proceso privado conserva bind_allowed y no llama a bind para cerrado',async()=>{
 const calls=[];
 const result=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,retryReviewedOnce:true,
  sourceHmac,chatHmac,apiKey:'synthetic-fixture-key-mvp351',model:'gpt-6-luna',
  rpc:async(name,args)=>{
   calls.push(name);
   if(name==='cotironda_piloto_auto_correlation_retry_prepare_mvp336')
    return {data:{state:'reserved',source_sha256:sha,quote,
     candidates:[liveMismatch,oldMatch],note:null},error:null};
   if(name==='cotironda_piloto_auto_correlation_finish_mvp291'){
    assert.equal(args.p_state,'review');
    assert.equal(args.p_reason,'historical_round_best_fit');
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected RPC '+name);
  },
  compare:async()=>evidence('r2')
 });
 assert.equal(result.state,'unresolved_private');
 assert.equal(result.outboundMessages,0);
 assert.deepEqual(calls,[
  'cotironda_piloto_auto_correlation_retry_prepare_mvp336',
  'cotironda_piloto_auto_correlation_finish_mvp291'
 ]);
});
test('MVP351: no confundir un rival historico con una prueba E2E ni publicar',()=>{
 const sql=readFileSync('supabase/piloto/mvp351_reintento_fidelidad_y_rivales_historicos.sql','utf8');
 assert.match(sql,/previous_reason='archived_materials_disagree'/);
 assert.match(sql,/r\.state IN\('prepared','closed'\)/);
 assert.match(sql,/r\.closed_at>v_source\.received_at/);
 assert.match(sql,/'bind_allowed',\(v_request\.state='prepared'\)/);
 assert.match(sql,/REVOKE ALL ON .*claim_reviewed_auto_recovery_mvp336/);
 assert.doesNotMatch(sql,/https?:\/\//);
 const bundle=buildMvp351Sql();
 assert.match(bundle,/mvp351-historical-rival-recovery-pg17\.sql/);
 assert.equal(bundle.split(/^ROLLBACK;\s*$/gm).length,2);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado\.(?:anonymous_offers_mvp091|whapi_outbox)/u);
});
