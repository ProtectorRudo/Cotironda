import test from 'node:test';
import assert from 'node:assert/strict';
import {generarHashMagiclinkD016,verificarMagiclinkRealD016,
 digestTicketPrivadoValidoD016}
 from '../../src/server/v2-d016-supabase-gotrue.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SESSION='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW=1800000000000;
const EXPIRES=(NOW/1000)+3600;
const HASH='e'.repeat(64);
const jwt=(patch={})=>{
 const payload={
  iss:PILOT+'/auth/v1',aud:'authenticated',role:'authenticated',
  sub:USER,session_id:SESSION,exp:EXPIRES,...patch
 };
 return 'a'.repeat(32)+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+
  '.'+'c'.repeat(50);
};
function fixture(){
 const calls={admin:0,verify:0,getUser:0};
 const state={hash:HASH,userId:USER,sessionUserId:USER,claims:{},expiry:EXPIRES,
  adminError:null,authError:null,getError:null,throwAt:''};
 const admin={auth:{admin:{generateLink:async params=>{
  calls.admin++;
  assert.deepEqual(params,{type:'magiclink',email:'buyer@cotironda.example'});
  if(state.throwAt==='admin')throw Error('private-cause');
  return {data:{properties:{hashed_token:state.hash}},error:state.adminError};
 }}}};
 const client={auth:{
  verifyOtp:async params=>{
   calls.verify++;
   assert.deepEqual(params,{type:'magiclink',token_hash:HASH});
   if(state.throwAt==='verify')throw Error('private-cause');
   return {data:{user:{id:state.userId},session:{
    access_token:jwt(state.claims),refresh_token:'r'.repeat(60),
    expires_at:state.expiry
   }},error:state.authError};
  },
  getUser:async token=>{
   calls.getUser++;
   assert.equal(token,jwt(state.claims));
   if(state.throwAt==='getUser')throw Error('private-cause');
   return {data:{user:{id:state.sessionUserId}},error:state.getError};
  }
 }};
 return {calls,state,admin,client};
}
test('D016 GoTrue: genera magiclink admin SOLO para cuenta ya resuelta',async()=>{
 const h=fixture();
 assert.deepEqual(await generarHashMagiclinkD016(
  h.admin,'buyer@cotironda.example'),{tokenHash:HASH});
 assert.equal(h.calls.admin,1);
 for(const bad of ['',null,'bad@','name@'+('a'.repeat(210))]){
  const f=fixture();
  assert.equal(await generarHashMagiclinkD016(f.admin,bad),null);
  assert.equal(f.calls.admin,0);
 }
});
test('D016 GoTrue: sesión validada mediante verifyOtp, getUser y JWT de PILOTO',async()=>{
 const h=fixture();
 const result=await verificarMagiclinkRealD016(h.client,HASH,NOW);
 assert.deepEqual(result,{userId:USER,sessionId:SESSION,
  accessToken:jwt(),refreshToken:'r'.repeat(60),expiresAtMs:EXPIRES*1000});
 assert.deepEqual(h.calls,{admin:0,verify:1,getUser:1});
});
test('D016 GoTrue: nunca validar solo la forma del JWT o token no acreditado',async()=>{
 for(const patch of [
  {claims:{iss:'https://other.supabase.co/auth/v1'}},
  {claims:{aud:'anon'}},{claims:{role:'anon'}},
  {claims:{sub:OTHER}},
  {claims:{session_id:'not-uuid'}},
  {claims:{exp:NOW/1000-1}},
  {claims:{exp:NOW/1000+3600},expiry:NOW/1000+100},
  {sessionUserId:OTHER},{userId:OTHER},
  {getError:{code:'unauthorized'}},
  {authError:{code:'invalid_otp'}}
 ]){
  const h=fixture();Object.assign(h.state,patch);
  const result=await verificarMagiclinkRealD016(h.client,HASH,NOW);
  assert.equal(result,null,JSON.stringify(patch));
 }
});
test('D016 GoTrue: errores del proveedor y datos incompletos fallan sin exportar datos',async()=>{
 for(const stage of ['admin','verify','getUser']){
  const h=fixture();h.state.throwAt=stage;
  if(stage==='admin'){
   assert.equal(await generarHashMagiclinkD016(
    h.admin,'buyer@cotironda.example'),null);
  }else{
   assert.equal(await verificarMagiclinkRealD016(h.client,HASH,NOW),null);
  }
 }
 for(const bad of [null,'x'.repeat(31),'!'.repeat(70)]){
  const h=fixture();
  assert.equal(await verificarMagiclinkRealD016(h.client,bad,NOW),null);
  assert.equal(h.calls.verify,0);
 }
 const h=fixture();h.state.hash='too-short';
 assert.equal(await generarHashMagiclinkD016(h.admin,'buyer@cotironda.example'),null);
 const f=fixture();f.state.adminError={code:'failed'};
 assert.equal(await generarHashMagiclinkD016(
  f.admin,'buyer@cotironda.example'),null);
 assert.equal(digestTicketPrivadoValidoD016('a'.repeat(64)),true);
 assert.equal(digestTicketPrivadoValidoD016('Z'.repeat(64)),false);
});
