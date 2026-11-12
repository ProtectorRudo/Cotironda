import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {contactoHashParaPiloto,claveAdminPilotoValida,
 prepararCompradorAuthMvp361} from '../../scripts/piloto/bootstrap-buyer-auth-mvp361.mjs';

const url='https://ilggkalaafhtiysyzlmg.supabase.co/';
const phone='+15550123456'; // Synthetic only; NEVER a real customer phone.
const jwt=(role='service_role')=>[
 Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({role,iss:'supabase'})).toString('base64url'),
 '0'.repeat(125)
].join('.');
const key=jwt();
const args={url,phone,adminKey:key};

test('MVP361: only E164 contact hash of WhatsApp identity, no contacts in result',()=>{
 const sha=createHash('sha256').update('15550123456@s.whatsapp.net').digest('hex');
 assert.equal(contactoHashParaPiloto(phone),sha);
 for(const bad of ['15550123456','+0','+123','+15550000000000000','+54 911',
                  '+5492211234567\n','+5492211234567 extra',null])
  assert.equal(contactoHashParaPiloto(bad),null);
 assert.equal(claveAdminPilotoValida(key),true);
 assert.equal(claveAdminPilotoValida(jwt('authenticated')),false);
 assert.equal(claveAdminPilotoValida('sb_publishable_'+'p'.repeat(35)),false);
 assert.equal(claveAdminPilotoValida('sb_secret_'+'s'.repeat(35)),false);
});

test('MVP361: dry-run does not even read RPC or create Auth account',async()=>{
 let calls=0;
 const r=await prepararCompradorAuthMvp361({
  ...args,mode:'dry-run',
  fetchFn:async()=>{calls++;throw Error('MUST_NOT_CALL')}
 });
 assert.deepEqual(r,{status:'DRY_RUN_ONLY_NOT_VERIFIED',wrote:false});
 assert.equal(calls,0);
});

test('MVP361: reject external URLs and forged admin keys without HTTP',async()=>{
 let calls=0;
 for(const candidate of [
  {...args,url:'https://evil.example/'},
  {...args,url:'http://ilggkalaafhtiysyzlmg.supabase.co/'},
  {...args,url:'https://ilggkalaafhtiysyzlmg.supabase.co/other'},
  {...args,url:'https://user:pass@ilggkalaafhtiysyzlmg.supabase.co/'},
  {...args,adminKey:jwt('anon')},
  {...args,phone:'+0'}
 ]){
  const r=await prepararCompradorAuthMvp361({
   ...candidate,mode:'apply',approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
   fetchFn:async()=>{calls++;throw Error('MUST_NOT_CALL')}
  });
  assert.equal(r.status,'BLOCKED_CONFIGURATION');
 }
 assert.equal(calls,0);
});
test('MVP361: --apply without explicit pilot approval never calls the network',async()=>{
 let calls=0;
 const r=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'',
  fetchFn:async()=>{calls++;throw Error('MUST_NOT_CALL')}
 });
 assert.equal(r.status,'BLOCKED_APPROVAL');
 assert.equal(calls,0);
});

function mockFetch({allowed=true,createStatus=201,created=true,throwOn=0}={}){
 const requests=[];
 const fetchFn=async(uri,options)=>{
  requests.push({uri,options});
  if(throwOn===requests.length)throw Error('do not log secret '+key);
  if(uri.endsWith('/cotironda_piloto_buyer_bootstrap_allowed_mvp361')){
   return new Response(JSON.stringify(allowed),{status:200,
    headers:{'Content-Type':'application/json'}});
  }
  if(uri.endsWith('/admin/users')) {
   return new Response(JSON.stringify(created?{
     id:'55555555-5555-4555-8555-555555555555',
     phone,phone_confirmed_at:null
   }:{error:'invalid'}),{status:createStatus,
     headers:{'Content-Type':'application/json'}});
  }
  throw Error('unexpected URL');
 };
 return {requests,fetchFn};
}
test('MVP361: --check verifies exact hash, never creates any user',async()=>{
 const fake=mockFetch();
 const r=await prepararCompradorAuthMvp361({
  ...args,mode:'check',fetchFn:fake.fetchFn
 });
 assert.deepEqual(r,{status:'VERIFIED_READY_NO_WRITE',wrote:false});
 assert.equal(fake.requests.length,1);
 assert(fake.requests[0].uri.endsWith('/rest/v1/rpc/cotironda_piloto_buyer_bootstrap_allowed_mvp361'));
 const body=JSON.parse(fake.requests[0].options.body);
 assert.equal(body.p_contact_sha256,contactoHashParaPiloto(phone));
 assert(!fake.requests[0].options.body.includes(phone));
 assert.equal(fake.requests[0].options.redirect,'error');
});
test('MVP361: failed identity proof blocks createUser, even when approved',async()=>{
 const fake=mockFetch({allowed:false});
 const r=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
  fetchFn:fake.fetchFn
 });
 assert.deepEqual(r,{status:'BLOCKED_IDENTITY',wrote:false});
 assert.equal(fake.requests.length,1);
});
test('MVP361: actual createUser requires proof and unconfirmed phone; NO SMS',async()=>{
 const fake=mockFetch();
 const r=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
  fetchFn:fake.fetchFn
 });
 assert.deepEqual(r,{status:'CREATED_UNCONFIRMED_OTP_REQUIRED',wrote:true});
 assert.equal(fake.requests.length,2);
 assert(fake.requests[1].uri.endsWith('/auth/v1/admin/users'));
 assert.equal(fake.requests[1].options.method,'POST');
 assert.deepEqual(JSON.parse(fake.requests[1].options.body),
                  {phone,phone_confirm:false});
 assert.equal(fake.requests[1].options.headers.apikey,key);
 assert.equal(fake.requests[1].options.redirect,'error');
 assert(!JSON.stringify(r).includes(phone));
 assert(!JSON.stringify(r).includes(key));
});
test('MVP361: a timeout after creation is UNCERTAIN, never auto retry',async()=>{
 const fake=mockFetch({throwOn:2});
 const r=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
  fetchFn:fake.fetchFn
 });
 assert.deepEqual(r,{status:'MANUAL_REVIEW_NETWORK_UNCERTAIN',wrote:true});
 assert.equal(fake.requests.length,2);
 assert(!JSON.stringify(r).includes(phone));
});
test('MVP361: duplicate account / unexpected confirmation must not claim success',async()=>{
 const fake=mockFetch({createStatus:422,created:false});
 const r=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
  fetchFn:fake.fetchFn
 });
 assert.equal(r.status,'MANUAL_REVIEW_CREATE');
 const r2=await prepararCompradorAuthMvp361({...args,mode:'apply',
  approval:'PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO',
  fetchFn:async(uri)=>uri.endsWith('/cotironda_piloto_buyer_bootstrap_allowed_mvp361')?
   new Response('true',{status:200}):
   new Response(JSON.stringify({id:'55555555-5555-4555-8555-555555555555',
     phone,phone_confirmed_at:'2026-11-12T00:00:00Z'}),{status:201})
 });
 assert.equal(r2.status,'MANUAL_REVIEW_AUTH_RESPONSE');
});

test('MVP361: preflight LIVE es SOLO SELECT y no filtra ninguna identidad',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const sql=readFileSync(resolve(root,
  'supabase/tests/preflight/mvp361-buyer-auth-readiness-readonly.sql'),'utf8');
 const uncommented=sql.replace(/^--.*$/gmu,'');
 assert.match(uncommented,/^\s*WITH buyers AS \(/u);
 assert.doesNotMatch(uncommented,
  /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/iu);
 for(const marker of ['01_buyer_whapi_identity','02_auth_user',
  '03_supplier_participation','04_originals_specific_consent',
  '05_originals_policy','06_active_round','07_auth_bootstrap_rpc',
  '08_phone_sms_provider','09_data_api_net'])
  assert(sql.includes(marker),marker);
 assert(!sql.includes('nonce_b64'));
 assert(!sql.includes('ciphertext_b64'));
 assert(!sql.includes('display_label'));
});
