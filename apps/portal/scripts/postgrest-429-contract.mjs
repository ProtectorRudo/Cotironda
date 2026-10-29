// Prueba de contrato con la librería REAL @supabase/supabase-js instalada
// por npm ci en CI. NO llama Supabase, NO genera usuarios, JWT ni empresas.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL_DEV='https://qkercsoqhehbenbbncwk.supabase.co';
const KEY_FALSA='sb_publishable_only_for_mock_ci';
const PARAMS={
 p_request_id:'123e4567-e89b-42d3-a456-426614174999',
 p_name:'X',p_type:'buyer',p_trade_name:null
};

async function probar({httpStatus,body,expectedError}) {
 let calls=0;
 const fakeFetch=async (input,init)=>{
  calls++;
  const url=String(typeof input==='string'?input:input.url);
  assert.equal(url,URL_DEV+'/rest/v1/rpc/register_company_for_current_user');
  assert.equal(init.method,'POST');
  assert.equal(JSON.parse(init.body).p_name,'X');
  return new Response(JSON.stringify(body),{
   status:httpStatus,headers:{'content-type':'application/json'}
  });
 };
 const client=createClient(URL_DEV,KEY_FALSA,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:fakeFetch},
  db:{retry:false}
 });
 const result=await client.rpc('register_company_for_current_user',PARAMS);
 assert.equal(result.status,httpStatus,'El status HTTP se conserva en PostgrestResponse');
 assert.equal(Boolean(result.error),expectedError);
 assert.equal(calls,1,'No debe haber reintentos en el RPC de prueba');
 return result;
}

const limited=await probar({
 httpStatus:429,
 body:{code:'PGRST_TEST',message:'Generic response, no rate_limited keyword'},
 expectedError:true
});
assert.equal(limited.status,429);
assert.equal(typeof limited.error?.message,'string');
assert.notEqual(limited.error?.status,429,
 'PostgrestError no debe asumirse como fuente de HTTP status');

const blocked=await probar({
 httpStatus:403,body:{code:'42501',message:'registro_no_habilitado'},
 expectedError:true
});
assert.equal(blocked.status,403);

const success=await probar({
 httpStatus:200,
 body:[{organization_id:'123e4567-e89b-42d3-a456-426614174998',replay:false,registration_status:'ok'}],
 expectedError:false
});
assert.equal(success.data?.[0]?.registration_status,'ok');
console.log('PASS: contrato real supabase-js 429, 403 y 200; fetch local falso, cero red.');
