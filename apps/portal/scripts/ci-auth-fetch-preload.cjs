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
  // MVP-026: separate, explicitly opt-in fake Supabase REST for pilot UI
  // smoke. Real network forbidden; browser never receives privileged keys.
  if(process.env.COTIRONDA_CI_WA_PREVIEW_SANDBOX==='enabled_for_tests_only'){
   const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
   const authorized=headers.get('authorization')==='Bearer '+token;
   const supplier='bbbbbbbb-0024-4024-8024-000000000661';
   const channel='mvp026_ci_channel';
   if(url.pathname==='/rest/v1/organizations'&&
    String(init.method??'GET').toUpperCase()==='GET'){
    if(!authorized)return respond({message:'unauthorized'},401);
    if(url.searchParams.get('organization_members.user_id')!=='eq.'+user.id||
     url.searchParams.get('organization_members.status')!=='eq.active'||
     url.searchParams.get('organization_members.membership_role')!=='in.(owner,manager)'||
     url.searchParams.get('organization_type')!=='in.(supplier,both)'||
     !url.searchParams.get('select')?.includes('supplier_profiles!inner'))
     return respond({message:'query not RLS scoped'},403);
    return respond([{id:supplier,display_name:'Corralón de prueba CI',organization_type:'supplier',
     organization_members:[{user_id:user.id,membership_role:'owner',status:'active'}],
     supplier_profiles:[{organization_id:supplier}]}]);
   }
   if(url.pathname==='/rest/v1/rpc/whapi_issue_supplier_code_d072'&&
      String(init.method??'POST').toUpperCase()==='POST'){
     if(!authorized)return respond({message:'unauthorized'},401);
     const payload=JSON.parse(init.body||'{}');
     if(Object.keys(payload).sort().join(',')!=='p_channel,p_supplier'||
        payload.p_supplier!==supplier||payload.p_channel!==channel)
        return respond({message:'not supplier member'},403);
     return respond({state:'issued',code:'a'.repeat(32),expiresSeconds:900});
   }
  }
  throw Error('HTTP externo bloqueado: endpoint Supabase no permitido '+url.pathname);
 }
 if(url.protocol==='http:'&&['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))
  return realFetch(input,init);
 throw Error('HTTP externo bloqueado para smoke CI Next');
};
