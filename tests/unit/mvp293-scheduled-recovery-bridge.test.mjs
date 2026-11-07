import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeAutoRecoveryMvp293} from '../../supabase/functions/cotironda-piloto-document-recovery/auto-recovery-tick-mvp293.ts';

const jwt=['a'.repeat(55),'b'.repeat(60),'c'.repeat(70)].join('.');
const secret='S'.repeat(64);
const base={
 enabled:true,
 pilotUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 serviceRoleJwt:jwt,
 recoverySecret:secret
};

test('bridges exactly one request to pilot internal worker, with TWO required credentials and no Whapi',async()=>{
 const calls=[];
 const result=await invokeAutoRecoveryMvp293({...base,post:async(url,init)=>{
  calls.push({url,init});
  return {ok:true,status:200};
 }});
 assert.equal(result,'accepted');
 assert.equal(calls.length,1);
 const {url,init}=calls[0];
 assert.equal(url,'https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-auto-recovery');
 assert.equal(init.method,'POST');
 assert.equal(init.body,'{}');
 assert.equal(init.headers.authorization,'Bearer '+jwt);
 assert.equal(init.headers['x-cotironda-recovery-secret'],secret);
 assert.ok(init.signal);
 assert.ok(!JSON.stringify(init).includes('whapi'));
});

test('gate off prevents any call',async()=>{
 let count=0;
 assert.equal(await invokeAutoRecoveryMvp293({...base,enabled:false,post:async()=>{count++;return {ok:true,status:200}}}),'off');
 assert.equal(count,0);
});

test('rejects missing secret, invalid JWT and wrong project BEFORE network',async()=>{
 let count=0;
 const post=async()=>{count++;return {ok:true,status:200}};
 for(const invalid of [
  {...base,recoverySecret:''},
  {...base,recoverySecret:'short'},
  {...base,serviceRoleJwt:'sb_secret_wrong'},
  {...base,serviceRoleJwt:''},
  {...base,pilotUrl:'https://other-project.supabase.co'}
 ]){
  assert.equal(await invokeAutoRecoveryMvp293({...invalid,post}),'configuration_unavailable');
 }
 assert.equal(count,0);
});

test('remote refusal stays local, never bypasses authentication',async()=>{
 assert.equal(await invokeAutoRecoveryMvp293({...base,post:async()=>({ok:false,status:401})}),'refused');
});

test('network failures stay local (legacy scheduled flow must retain own response)',async()=>{
 assert.equal(await invokeAutoRecoveryMvp293({...base,post:async()=>{throw Error('do not surface secrets')}}),'unavailable');
});
