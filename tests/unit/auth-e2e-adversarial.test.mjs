import test from 'node:test';
import assert from 'node:assert/strict';
import {jwtConSujetoManipulado,verificarFirmaContraPostgrest} from '../../src/server/auth-e2e-adversarial.ts';
const payload={sub:'123e4567-e89b-42d3-a456-426614174999',role:'authenticated',exp:1000};
const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
const jwt='eyJhbGciOiJIUzI1NiJ9.'+encoded+'.firmatest';
const input={
 url:'https://qkercsoqhehbenbbncwk.supabase.co',key:'sb_publishable_testonly',
 token:jwt,requestId:'123e4567-e89b-42d3-a456-426614174005'
};
test('manipula sub sin cambiar firma ni JWT original',()=>{
 const forged=jwtConSujetoManipulado(jwt);
 assert.notEqual(forged,jwt);
 assert.equal(forged.split('.')[2],jwt.split('.')[2]);
 assert.equal(JSON.parse(Buffer.from(forged.split('.')[1],'base64url').toString()).role,'authenticated');
 assert.notEqual(JSON.parse(Buffer.from(forged.split('.')[1],'base64url').toString()).sub,payload.sub);
 assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString()).sub,payload.sub);
});
test('rechaza tokens de formato inválido o sujeto ausente',()=>{
 for(const x of ['', 'abc','a.b','a.b.c.d'])assert.throws(()=>jwtConSujetoManipulado(x),/jwt_/);
 assert.throws(()=>jwtConSujetoManipulado('a.'+Buffer.from('{}').toString('base64url')+'.c'),/sin_sujeto/);
});
test('solicitud adversarial nunca lleva un nombre válido ni credenciales propias',async()=>{
 let checked=false;
 await verificarFirmaContraPostgrest(input,async(url,init)=>{
  checked=true;
  assert.equal(url,input.url+'/rest/v1/rpc/register_company_for_current_user');
  assert.equal(init.method,'POST');
  assert.equal(init.cache,'no-store');
  assert.equal(JSON.parse(init.body).p_name,'X');
  assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(),['p_name','p_request_id','p_trade_name','p_type']);
  assert.notEqual(init.headers.authorization,'Bearer '+jwt);
  assert.equal(init.headers.apikey,input.key);
  return {status:401,json:async()=>({code:'PGRST301',message:'Invalid JWT'})};
 });
 assert.equal(checked,true);
});
test('no confunde validaciones de campos con verificación de firma',async()=>{
 await assert.rejects(verificarFirmaContraPostgrest(input,async()=>({status:400,json:async()=>({message:'nombre_invalido'})})),/no_rechazado/);
});
test('no confunde doble flag SQL con firma rechazada',async()=>{
 await assert.rejects(verificarFirmaContraPostgrest(input,async()=>({status:403,json:async()=>({code:'42501',message:'registro_no_habilitado'})})),/no_rechazado/);
});
test('acepta rechazo explícito por firma inválida',async()=>{
 await verificarFirmaContraPostgrest(input,async()=>({status:403,json:async()=>({message:'JWT signature verification failed'})}));
});
test('rechaza HTTP 200, aun cuando resultado esté vacío',async()=>{
 await assert.rejects(verificarFirmaContraPostgrest(input,async()=>({status:200,json:async()=>null})),/no_rechazado/);
});
test('endpoint genérico ajeno bloqueado antes de tocar red',async()=>{
 await assert.rejects(verificarFirmaContraPostgrest({...input,url:'https://portal.example.com'},async()=>{throw Error('NO NETWORK')}),/endpoint_no_es_supabase/);
});
test('nunca revela token completo al producir un error',async()=>{
 try {await verificarFirmaContraPostgrest({...input,token:'malformed'},async()=>{throw Error('NO NETWORK')});assert.fail();}
 catch(e){assert.doesNotMatch(e.message,/firmatest/);}
});
