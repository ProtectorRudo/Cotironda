// E2E REAL: PostgreSQL 17/PostgREST con JWT firmado SOLO en runner de GitHub.
// Dos empresas sintéticas y cuatro perfiles. Nunca consultar un Supabase remoto.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const HOST='http://127.0.0.1:3409';
const secret=process.env.COTIRONDA_CI_JWT_SECRET;
const USERS={
 a:'a1111111-1111-4111-8111-111111111111',
 b:'b2222222-2222-4222-8222-222222222222',
 c:'c3333333-3333-4333-8333-333333333333',
 d:'d4444444-4444-4444-8444-444444444444'
};
const SESSIONS={
 a:'f1111111-1111-4111-8111-111111111111',
 b:'f2222222-2222-4222-8222-222222222222',
 c:'f3333333-3333-4333-8333-333333333333',
 d:'f4444444-4444-4444-8444-444444444444'
};
const ORGS={
 a:'11111111-1111-4111-8111-111111111111',
 b:'22222222-2222-4222-8222-222222222222'
};
const PRODUCT_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

if(process.env.GITHUB_ACTIONS!=='true' ||
   process.env.COTIRONDA_POSTGREST_HTTP_CI!=='true' ||
   process.env.PGHOST!=='127.0.0.1' ||
   process.env.PGDATABASE!=='cotironda_ci_http' ||
   typeof secret!=='string' || secret.length<48){
 throw new Error('entorno_http_ci_no_autorizado');
}
function sql(query){
 return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',query],{
  env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:7000
 }).trim();
}
const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function token(subject,session,extra={}){
 const now=Math.floor(Date.now()/1000);
 const head=enc({alg:'HS256',typ:'JWT'});
 const body=enc({
  sub:subject,session_id:session,role:'authenticated',
  is_anonymous:false,cotironda_email_verified:true,
  iat:now-2,exp:now+600,...extra
 });
 const unsigned=head+'.'+body;
 return unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');
}
const jwt=Object.fromEntries(
 Object.entries(USERS).map(([k,user])=>[k,token(user,SESSIONS[k])])
);
async function http(method,path,accessToken,body){
 assert.match(path,/^\/(?:organizations|organization_members|supplier_profiles|supplier_categories|supplier_products|supplier_delivery_areas)(?:\?[A-Za-z0-9%_.&,=-]+)?$/);
 const response=await fetch(HOST+path,{
  method,
  headers:{
   ...(accessToken?{authorization:'Bearer '+accessToken}:{}),
   ...(body?{'content-type':'application/json'}:{}),
   prefer:'return=representation'
  },
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(6000)
 });
 const text=await response.text();
 let data=null;
 try {data=JSON.parse(text)}catch{}
 return {status:response.status,data};
}
async function rows(table,accessToken){
 const r=await http('GET','/'+table+'?select=*',accessToken);
 assert.equal(r.status,200,table+' lectura inesperada: HTTP '+r.status);
 assert.ok(Array.isArray(r.data),'Respuesta RLS no es array: '+table);
 return r.data;
}
function exactIds(records,key,ids,label){
 assert.deepEqual(records.map(r=>r[key]).sort(),[...ids].sort(),label);
}
function product(org,sku){
 return {
  id:randomUUID(),organization_id:org,category_code:'electricidad',
  product_name:sku,unit_code:'m'
 };
}
async function run(){
 // Precondiciones que impiden falsos éxitos por una BD cerrada/sin fixtures.
 assert.equal(sql("select enabled from cotironda_private.registration_settings where singleton=true"),'f');
 assert.equal(sql('select count(*) from public.organizations'),'2');
 assert.equal(sql('select count(*) from public.supplier_products'),'2');
 assert.equal(sql('select count(*) from auth.sessions'),'4');

 const deniedAnon=await http('GET','/organizations?select=id');
 assert.ok([401,403].includes(deniedAnon.status),'Anon no debe acceder a empresas');
 console.log('PASS HTTP RLS: anónimo sin acceso');

 for(const [user,orgs] of [
  ['a',[ORGS.a]],['b',[ORGS.b]],['c',[ORGS.a]],['d',[]]
 ]){
  exactIds(await rows('organizations',jwt[user]),'id',orgs,'organizaciones '+user);
  exactIds(await rows('supplier_profiles',jwt[user]),'organization_id',orgs,'perfiles '+user);
  exactIds(await rows('supplier_categories',jwt[user]),'organization_id',orgs,'rubros '+user);
  exactIds(await rows('supplier_products',jwt[user]),'organization_id',orgs,'productos '+user);
  exactIds(await rows('supplier_delivery_areas',jwt[user]),'organization_id',orgs,'zonas '+user);
 }
 console.log('PASS HTTP RLS: empresas, catálogos, rubros y zonas aisladas; suspendido invisible');

 // organization_members permite ver la membresía propia, no las ajenas.
 for(const user of ['a','b','c','d']){
  const list=await rows('organization_members',jwt[user]);
  exactIds(list,'user_id',[USERS[user]],'membresía propia '+user);
 }
 console.log('PASS HTTP RLS: membresías de otros usuarios no filtradas');

 // user_metadata es editable por cliente: jamás debe dar privilegios de otro tenant.
 const spoof=token(USERS.a,SESSIONS.a,{
  user_metadata:{role:'owner',organization_id:ORGS.b,is_admin:true}
 });
 exactIds(await rows('organizations',spoof),'id',[ORGS.a],'metadata falsificada');
 exactIds(await rows('supplier_products',spoof),'organization_id',[ORGS.a],'catálogo con metadata falsa');
 console.log('PASS HTTP RLS: user_metadata falsificada no eleva permisos');

 // Dueño A sí puede editar su producto; si no funciona, un 200 vacío engañaría.
 const own=await http('PATCH','/supplier_products?id=eq.'+PRODUCT_A,jwt.a,{
  product_name:'Cable A actualizado CI'
 });
 assert.equal(own.status,200,'propietario A debe poder modificar');
 assert.equal(own.data?.length,1,'escritura propia tiene que modificar una fila');
 assert.equal(own.data[0].product_name,'Cable A actualizado CI');
 assert.equal(sql("select product_name from public.supplier_products where id='"+PRODUCT_A+"'"),'Cable A actualizado CI');
 console.log('PASS HTTP RLS: dueño escribe en su propia empresa');

 // UPDATE ajeno y miembro sin permiso: PostgREST suele devolver [] con HTTP 200.
 for(const [actor,id] of [['a',PRODUCT_B],['c',PRODUCT_A],['d',PRODUCT_A]]){
  const result=await http('PATCH','/supplier_products?id=eq.'+id,jwt[actor],{
   product_name:'NO DEBE CAMBIAR CI'
  });
  assert.equal(result.status,200,'PATCH oculto debe producir respuesta controlada');
  assert.deepEqual(result.data,[],'PATCH prohibido no puede afectar filas: '+actor);
 }
 assert.equal(sql("select product_name from public.supplier_products where id='"+PRODUCT_B+"'"),'Cable B CI');
 assert.equal(sql("select product_name from public.supplier_products where id='"+PRODUCT_A+"'"),'Cable A actualizado CI');
 console.log('PASS HTTP RLS: actualizaciones ajenas, lector y suspendido sin efecto');

 // Los INSERT de otros tenants o roles sin permiso deben ser denegados.
 for(const [actor,org] of [['a',ORGS.b],['c',ORGS.a],['d',ORGS.a]]){
  const result=await http('POST','/supplier_products',jwt[actor],product(org,'NO AUTORIZADO CI'));
  assert.ok([401,403].includes(result.status),'INSERT prohibido no rechazado: '+actor+' HTTP '+result.status);
 }
 assert.equal(sql('select count(*) from public.supplier_products'),'2');
 const added=await http('POST','/supplier_products',jwt.a,product(ORGS.a,'Cable nuevo A CI'));
 assert.equal(added.status,201,'owner A debe poder agregar producto');
 assert.equal(added.data?.length,1);
 assert.equal(added.data[0].organization_id,ORGS.a);
 console.log('PASS HTTP RLS: INSERT prohibido bloqueado y propio permitido');

 const foreignDel=await http('DELETE','/supplier_products?id=eq.'+PRODUCT_B,jwt.a);
 assert.equal(foreignDel.status,200);
 assert.deepEqual(foreignDel.data,[]);
 assert.equal(sql("select count(*) from public.supplier_products where id='"+PRODUCT_B+"'"),'1');
 const memberDelete=await http('DELETE','/supplier_products?id=eq.'+PRODUCT_A,jwt.c);
 assert.equal(memberDelete.status,200);
 assert.deepEqual(memberDelete.data,[]);
 console.log('PASS HTTP RLS: DELETE no puede borrar productos ajenos o sin rol');

 const forbiddenArea=await http('POST','/supplier_delivery_areas',jwt.a,{
  organization_id:ORGS.b,province:'Buenos Aires',city:'Junin'
 });
 assert.ok([401,403].includes(forbiddenArea.status),'zona ajena no rechazada');
 const ownArea=await http('POST','/supplier_delivery_areas',jwt.a,{
  organization_id:ORGS.a,province:'Buenos Aires',city:'Berisso'
 });
 assert.equal(ownArea.status,201);
 assert.equal(ownArea.data?.length,1);
 assert.equal(ownArea.data[0].city,'Berisso');
 assert.equal(sql("select count(*) from public.supplier_delivery_areas where organization_id='"+ORGS.b+"'"),'1');
 console.log('PASS HTTP RLS: zonas de entrega respetan empresa y rol');

 // No se altera ni el registro, ni cuotas, ni el servicio remoto.
 assert.equal(sql('select count(*) from cotironda_private.registration_attempt_quotas'),'0');
 assert.equal(sql("select enabled from cotironda_private.registration_settings where singleton=true"),'f');
}
try{
 await run();
 console.log('PASS: RLS multiempresa HTTP/PostgREST auténtico en PostgreSQL CI descartable');
}finally{
 try{
  sql("delete from public.supplier_delivery_areas");
  sql("delete from public.supplier_products");
  sql("delete from public.supplier_categories");
  sql("delete from public.supplier_profiles");
  sql("delete from public.organization_members");
  sql("delete from public.organizations");
  sql("delete from auth.sessions");
  sql("delete from auth.users");
  assert.equal(sql('select count(*) from public.organizations'),'0');
  assert.equal(sql('select count(*) from public.organization_members'),'0');
  assert.equal(sql('select count(*) from public.supplier_products'),'0');
  assert.equal(sql('select count(*) from auth.sessions'),'0');
  assert.equal(sql('select count(*) from auth.users'),'0');
  assert.equal(sql("select enabled from cotironda_private.registration_settings where singleton=true"),'f');
  console.log('PASS: limpieza RLS CI comprobada y registro sigue apagado');
 }catch{
  console.error('FAIL: limpieza de fixture RLS no comprobada');
  process.exitCode=1;
 }
}
