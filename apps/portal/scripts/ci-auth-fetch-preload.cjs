// Interceptor de red SOLO para servidor Next local de CI, NUNCA publicar ni usar con cuentas reales.
const {projectRef,token,user,session}=require('./ci-auth-fixture.cjs');
if(process.env.COTIRONDA_CI_AUTH_SANDBOX!=='enabled_for_tests_only')
 throw Error('Interceptor Auth sólo puede iniciarse con la bandera CI explícita');
const realFetch=globalThis.fetch;
const allowedOrigin='https://'+projectRef+'.supabase.co';
const respond=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json'}});
globalThis.fetch=async function(input,init={}){
 const raw=typeof input==='string'?input:(input instanceof URL?input.href:input.url);
 const url=new URL(raw);
 if(url.origin===allowedOrigin){
  if(url.pathname==='/auth/v1/user'){
   const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
   const bearer=headers.get('authorization');
   if(bearer!=='Bearer '+token)return respond({code:401,msg:'invalid JWT'},401);
   return respond(user);
  }
  if(url.pathname==='/auth/v1/.well-known/jwks.json')
   return respond({keys:[]});
  if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
   const data=JSON.parse(init.body||'{}');
   if(data.refresh_token==='ci_refresh_fake_only')return respond(session);
   return respond({error:'invalid_grant'},401);
  }
  throw Error('HTTP externo bloqueado: endpoint Supabase no permitido '+url.pathname);
 }
 if(url.protocol==='http:'&&['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))
  return realFetch(input,init);
 throw Error('HTTP externo bloqueado para smoke CI Next');
};
