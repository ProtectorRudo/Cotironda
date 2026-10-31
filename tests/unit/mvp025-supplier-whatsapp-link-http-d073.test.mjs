import test from 'node:test';
import assert from 'node:assert/strict';
import {habilitarPantallaAltaWhatsAppD073,procesarEnlaceAltaProveedorD073}
 from '../../src/server/supplier-whatsapp-link-http-d073.ts';

const ORIGIN='https://cotironda-ci.example';
const SUPPLIER='bbbbbbbb-0024-4024-8024-000000000661';
const ACTOR={userId:'11111111-0024-4024-8024-000000000661',
 emailVerificado:true,anonimo:false};
const CODE='a'.repeat(32);
const ENV={
 VERCEL_ENV:'preview',COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
 COTIRONDA_SITE_ORIGIN:ORIGIN,
 NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dummy_preview',
 COTIRONDA_SUPPLIER_WA_UI_ENABLED:'true',
 COTIRONDA_SUPPLIER_WA_BOT_NUMBER:'5492211234567',
 COTIRONDA_SUPPLIER_WA_CHANNEL:'canal_ci_mvp025'
};
function make({headers={},body={supplierOrgId:SUPPLIER},enabled=true,
 actor=ACTOR,method='POST',rpc=async()=>({payload:{
  state:'issued',code:CODE,expiresSeconds:900}})}={}){
 const calls={session:0,rpc:0};
 const req=new Request(ORIGIN+'/api/proveedores/whatsapp/enlace',{
  method,headers:{origin:ORIGIN,'content-type':'application/json',...headers},
  ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
 });
 return{req,calls,deps:{
  habilitado:enabled,originPermitido:ORIGIN,
  channel:ENV.COTIRONDA_SUPPLIER_WA_CHANNEL,
  botNumber:ENV.COTIRONDA_SUPPLIER_WA_BOT_NUMBER,
  verificarSesion:async()=>{calls.session++;return actor;},
  emitir:async(sql,args)=>{calls.rpc++;return rpc(sql,args)}
 }};
}
test('D073: únicamente Preview exacto con Auth y flag explícito habilita',()=>{
 assert.equal(habilitarPantallaAltaWhatsAppD073(ENV),true);
 for(const override of [
  {COTIRONDA_SUPPLIER_WA_UI_ENABLED:'false'},
  {VERCEL_ENV:'production'},
  {VERCEL_ENV:'development'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {VERCEL_GIT_COMMIT_REF:'feat/mvp-026-auth-proveedor-preview-aislada'},
  {COTIRONDA_SUPPLIER_WA_CHANNEL:'invalid channel'},
  {COTIRONDA_SUPPLIER_WA_BOT_NUMBER:'invalid'},
  {SUPABASE_SERVICE_ROLE_KEY:'secret'},
  {COTIRONDA_DATABASE_URL:'postgresql://local'},
  {COTIRONDA_WHAPI_SEND_ENABLED:'true'},
  {COTIRONDA_SUPABASE_PROJECT_REF:'another'},
  {COTIRONDA_SITE_ORIGIN:'http://phishing.example'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'}
 ])assert.equal(habilitarPantallaAltaWhatsAppD073({...ENV,...override}),false,
  JSON.stringify(Object.keys(override)));
});
test('D073: OFF -> HTTP 503 sin Auth ni RPC',async()=>{
 const f=make({enabled:false});
 const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
 assert.equal(r.status,503);assert.equal(f.calls.session,0);assert.equal(f.calls.rpc,0);
 assert.match(r.headers.get('cache-control'),/no-store/);
});
test('D073: responde enlace wa.me exacto, no token en texto aislado',async()=>{
 const f=make();
 const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{
  url:'https://wa.me/5492211234567?text=COTI%20ALTA%20'+CODE,
  venceEnSegundos:900});
 assert.equal(f.calls.session,1);assert.equal(f.calls.rpc,1);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
});
test('D073: origen incorrecto, ausente, cross-site y content-type bloqueados',async()=>{
 for(const h of [{origin:'https://evil.invalid'},
  {origin:''},{'sec-fetch-site':'cross-site'},
  {'content-type':'text/plain'}]){
  const f=make({headers:h});
  const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
  assert.ok([403,415].includes(r.status));
  assert.equal(f.calls.session,0);assert.equal(f.calls.rpc,0);
 }
});
test('D073: contenido extra, UUID ajeno y JSON inválido se rechazan sin RPC',async()=>{
 for(const body of [{supplierOrgId:'wrong'},{
  supplierOrgId:SUPPLIER,channel:'evil'},
  {supplierOrgId:SUPPLIER,token:CODE},[],{},'not-json',
  'Z'.repeat(300)]){
  const f=make({body});
  const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
  assert.ok([400,413].includes(r.status),JSON.stringify(body));
  assert.equal(f.calls.session,0);assert.equal(f.calls.rpc,0);
 }
});
test('D073: cookies sin sesión viva, anon y correo no confirmado => 401',async()=>{
 for(const actor of [null,{...ACTOR,userId:'invalido'},
  {...ACTOR,emailVerificado:false},{...ACTOR,anonimo:true}]){
  const f=make({actor});
  const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
  assert.equal(r.status,401);assert.equal(f.calls.rpc,0);
 }
});
test('D073: SQL o Auth falla cerrado sin filtrar datos comerciales',async()=>{
 const f=make({rpc:async()=>{throw Error('private_supplier_phone')}});
 const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
 assert.equal(r.status,503);
 const data=await r.json();
 assert.deepEqual(data,{error:'enlace_no_disponible'});
 assert.doesNotMatch(JSON.stringify(data),/private_supplier_phone/);
});
test('D073: token no válido y respuesta SQL inesperada se rechazan',async()=>{
 for(const payload of [
  {state:'issued',code:'short',expiresSeconds:900},
  {state:'issued',code:CODE,expiresSeconds:1800},
  {state:'issued',code:CODE,expiresSeconds:900,phone:'secret'},
  {state:'confirmed',code:CODE,expiresSeconds:900}
 ]){
  const f=make({rpc:async()=>({payload})});
  const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
  assert.equal(r.status,503);
 }
});
test('D073: GET sin activar no toca sesión ni proveedor',async()=>{
 const f=make({method:'GET'});
 const r=await procesarEnlaceAltaProveedorD073(f.req,f.deps);
 assert.equal(r.status,405);assert.equal(f.calls.session,0);assert.equal(f.calls.rpc,0);
});
