import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 comprobarRegistroAuthSoloLectura
} from '../../src/server/auth-signup-readonly-audit.ts';
import {COTIRONDA_DEV_REF} from '../../src/server/portal-entorno.ts';

const ref=COTIRONDA_DEV_REF;
const base={
 projectRef:ref,
 url:'https://'+ref+'.supabase.co',
 publishableKey:'sb_publishable_ci_only_testing'
};
function response(value,{status=200,contentType='application/json',redirected=false}={}){
 const r=new Response(
  typeof value==='string'?value:JSON.stringify(value),
  {status,headers:{'content-type':contentType}}
 );
 if(redirected) Object.defineProperty(r,'redirected',{value:true});
 return r;
}
const fake=(r)=>async(_input,_opts)=>r;

test('Auth disable_signup=true: PASS sin confundirlo con el flag comercial',async()=>{
 const result=await comprobarRegistroAuthSoloLectura(base,fake(response({disable_signup:true})));
 assert.deepEqual(result,{estado:'PASS',codigo:'autorregistro_auth_bloqueado'});
});

test('Auth disable_signup=false: FAIL aunque la UI no tenga signup',async()=>{
 const result=await comprobarRegistroAuthSoloLectura(base,fake(response({disable_signup:false,external:{email:true}})));
 assert.deepEqual(result,{estado:'FAIL',codigo:'autorregistro_auth_habilitado'});
});

test('la consulta es exclusivamente GET settings y apikey publicable, sin cookie ni JWT',async()=>{
 let count=0;
 const result=await comprobarRegistroAuthSoloLectura(base,async(input,init)=>{
  count++;
  assert.equal(input,'https://'+ref+'.supabase.co/auth/v1/settings');
  assert.equal(init.method,'GET');
  assert.equal(init.credentials,'omit');
  assert.equal(init.cache,'no-store');
  assert.equal(init.redirect,'error');
  assert.equal(init.referrerPolicy,'no-referrer');
  assert.equal(init.headers.apikey,base.publishableKey);
  assert.equal(init.headers.accept,'application/json');
  assert.equal(Object.keys(init.headers).length,2);
  assert.ok(init.signal.aborted===false);
  return response({disable_signup:true});
 });
 assert.equal(count,1);
 assert.equal(result.estado,'PASS');
});

test('ningún proyecto ajeno ni clave privada origina una petición',async()=>{
 const patches=[
  {projectRef:'another-project'},
  {projectRef:undefined},
  {url:'https://example.invalid'},
  {url:'https://'+ref+'.supabase.co.evil.test'},
  {url:'http://'+ref+'.supabase.co'},
  {url:'https://user:pass@'+ref+'.supabase.co'},
  {publishableKey:'sb_secret_private'},
  {publishableKey:'service_role.jwt'},
  {publishableKey:''},
  {publishableKey:'sb_publishable_'+('x'.repeat(400))}
 ];
 for(const patch of patches){
  const result=await comprobarRegistroAuthSoloLectura({...base,...patch},async()=>{
   throw new Error('No debe haber red para una configuración sospechosa');
  });
  assert.equal(result.estado,'INCONCLUSO',JSON.stringify(Object.keys(patch)));
 }
});

test('schemas desconocidos o campos de texto no generan falsos PASS ni FAIL',async()=>{
 for(const payload of [
  {},{disable_signup:null},{disable_signup:'true'},
  {disable_signup:'false'},{disable_signup:1},
  {external:{email:true}},[],null
 ]){
  const result=await comprobarRegistroAuthSoloLectura(base,fake(response(payload)));
  assert.equal(result.estado,'INCONCLUSO');
 }
});

test('HTML, status de error o redirect no demuestran Auth cerrado',async()=>{
 for(const r of [
  response({disable_signup:true},{status:401}),
  response({disable_signup:true},{status:403}),
  response({disable_signup:true},{status:429}),
  response({disable_signup:true},{status:500}),
  response('{"disable_signup":true}',{contentType:'text/html'}),
  response({disable_signup:true},{redirected:true}),
  response('INVALID_JSON')
 ]){
  assert.equal((await comprobarRegistroAuthSoloLectura(base,fake(r))).estado,'INCONCLUSO');
 }
});

test('transporte inaccesible y abortos devuelven INCONCLUSO sin filtrar excepción',async()=>{
 for(const error of [
  new Error('security details: email invalid@example.com'),
  new Error('CORS bloqueado'),
  new DOMException('cancelled','AbortError')
 ]){
  const result=await comprobarRegistroAuthSoloLectura(base,async()=>{throw error});
  assert.deepEqual(result,{estado:'INCONCLUSO',codigo:'configuracion_no_verificable'});
 }
});

test('no aceptar un cuerpo JSON enorme o Content-Length sospechoso',async()=>{
 const oversized={disable_signup:true,details:'x'.repeat(16500)};
 assert.equal((await comprobarRegistroAuthSoloLectura(base,fake(response(oversized)))).estado,'INCONCLUSO');
 const r=response({disable_signup:true});
 r.headers.set('content-length','30000');
 assert.equal((await comprobarRegistroAuthSoloLectura(base,fake(r))).estado,'INCONCLUSO');
 const wrong=response({disable_signup:true});
 wrong.headers.set('content-length','n/a');
 assert.equal((await comprobarRegistroAuthSoloLectura(base,fake(wrong))).estado,'INCONCLUSO');
});

test('el componente se renderiza solamente después de auth.getUser y dentro de Preview',()=>{
 const page=readFileSync(new URL('../../apps/portal/app/alta/page.tsx',import.meta.url),'utf8');
 const login=readFileSync(new URL('../../apps/portal/app/ingresar/page.tsx',import.meta.url),'utf8');
 const posAuth=page.indexOf('auth.auth.getUser()');
 const posPreview=page.indexOf('if(entornoAuthSoloIngresoPreview())');
 const posDiag=page.indexOf('<AuditoriaRegistroAuth/>');
 const posForm=page.indexOf('<FormularioEmpresa/>');
 assert.ok(posAuth>=0&&posPreview>posAuth&&posDiag>posPreview&&posForm>posDiag);
 assert.doesNotMatch(login,/AuditoriaRegistroAuth/);
});

test('ningún test ni UI POSTea signup, crea emails o persiste información privada',()=>{
 const code=readFileSync(new URL('../../apps/portal/app/alta/auditoria-registro-auth.tsx',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../../src/server/auth-signup-readonly-audit.ts',import.meta.url),'utf8');
 assert.match(code,/Comprobar autorregistro Auth/);
 assert.match(helper,/auth\/v1\/settings/);
 assert.match(helper,/method:'GET'/);
 assert.doesNotMatch(code,/signUp\(|localStorage|sessionStorage|sendBeacon|createUser|\.password|\.email/);
 assert.doesNotMatch(helper,/\/signup['"`]|method:'POST'|Authorization:|Bearer |token:|console\.log|console\.error/);
});
