import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../tests/manual/cotironda-auth-dev-browser.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'El diagnóstico HTML necesita script inline autocontenido');
const origin='https://qkercsoqhehbenbbncwk.supabase.co';
const emailGood='verified-ci@example.invalid',emailPending='pending-ci@example.invalid';
const privatePassword='ci-fake-password-only-for-unit-tests';
const uid='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
function b64(v){return Buffer.from(JSON.stringify(v)).toString('base64url');}
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({
 sub:uid,role:'authenticated',session_id:sid,
 cotironda_email_verified:true,is_anonymous:false,
 exp:Math.floor(Date.now()/1000)+3600
})+'.ci_fake_signature_no_real_auth';

class Element {
 constructor(){this.children=[];this.listeners={};this._text='';this.value='';this.checked=false;this.disabled=false;this.className='';this.style={};}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 append(...children){this.children.push(...children);}
 appendChild(child){this.children.push(child);}
 addEventListener(name,callback){this.listeners[name]=callback;}
 setAttribute(){}
 focus(){}
 select(){}
}
function harness({leak=false,logoutError=false,networkError=false,pendingAllowed=false,firstLoginError=false}={}){
 const nodes=new Map();
 for(const key of ['form','results','run','copy','verifiedEmail','verifiedPassword',
  'pendingEmail','pendingPassword','samePassword'])nodes.set(key,new Element());
 nodes.get('verifiedEmail').value=emailGood;
 nodes.get('verifiedPassword').value=privatePassword;
 nodes.get('pendingEmail').value=emailPending;
 nodes.get('samePassword').checked=true;
 let signedOut=false,logoutCalls=0;
 const requests=[];
 const reportCopies=[];
 const document={
  getElementById(id){assert.ok(nodes.has(id),'HTML apunta a ID desconocido '+id);return nodes.get(id)},
  createElement(){return new Element()}
 };
 const response=(data,status=200)=>new Response(
   status===204?null:JSON.stringify(data),
   {status,headers:status===204?{}:{'content-type':'application/json'}}
 );
 const fakeFetch=async(url,options)=>{
  const u=new URL(url);
  assert.equal(u.origin,origin,'No se acepta otro origen fuera de Supabase dev');
  assert.ok(['/auth/v1/token','/auth/v1/user','/auth/v1/logout',
   '/rest/v1/catalog_categories'].includes(u.pathname),'Endpoint no permitido');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.redirect,'error');
  assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
  assert.ok(!JSON.stringify(options.headers).includes('sb_secret_'));
  requests.push({pathname:u.pathname,method:options.method,
   auth:options.headers.authorization,body:options.body});
  if(u.pathname==='/auth/v1/token'){
   assert.equal(u.search,'?grant_type=password');
   const payload=JSON.parse(options.body);
   if(payload.email===emailGood){
    assert.equal(payload.password,privatePassword);
    return firstLoginError?response({code:'invalid_credentials'},400):response({access_token:token});
   }
   if(payload.email===emailPending){
    assert.equal(payload.password,privatePassword);
    return pendingAllowed?response({access_token:token}):response({
     code:'email_not_confirmed',msg:'Email not confirmed'
    },400);
   }
   throw Error('Email fuera del fixture de ensayo');
  }
  assert.equal(options.headers.authorization,'Bearer '+token,'El GET usa JWT original');
  if(u.pathname==='/auth/v1/user'){
   return response({id:uid,email_confirmed_at:'2026-01-01T00:00:00Z'},200);
  }
  if(u.pathname==='/auth/v1/logout'){
   logoutCalls++;
   if(logoutError)return response({error:'failed'},500);
   signedOut=true;return response(null,204);
  }
  if(networkError)throw Error('token or password from server '+privatePassword);
  assert.equal(u.pathname,'/rest/v1/catalog_categories');
  assert.equal(u.search,'?select=code&is_active=eq.true&order=code.asc');
  return response(signedOut&&!leak?[]:[{code:'corralon'},{code:'sanitarios'}]);
 };
 const clipboard={writeText:async s=>{reportCopies.push(s)}};
 vm.runInNewContext(script,{
  document,fetch:fakeFetch,Uint8Array,TextDecoder,atob,AbortController,
  setTimeout,clearTimeout,Date,navigator:{clipboard}
 },{filename:'cotironda-auth-dev-browser.html',timeout:2500});
 async function execute(){
  await nodes.get('form').listeners.submit({preventDefault(){}});
  return nodes.get('results').children.map(row=>row.children.map(x=>x.textContent).join(' '));
 }
 async function copy(){await nodes.get('copy').listeners.click();}
 return {execute,copy,nodes,requests,reportCopies,get logoutCalls(){return logoutCalls}};
}

test('CSP prohíbe conexión a terceros y formulario no persiste ni envía contraseñas a GitHub',()=>{
 assert.match(html,/connect-src https:\/\/qkercsoqhehbenbbncwk\.supabase\.co/);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/referrer" content="no-referrer"/);
 assert.match(html,/id="samePassword" type="checkbox" checked/);
 assert.doesNotMatch(script,/localStorage\.|sessionStorage\.|indexedDB\.|sendBeacon\(|XMLHttpRequest\(|document\.cookie|innerHTML\s*=/);
 assert.doesNotMatch(script,/github\.com|vercel\.app|whapi|mercadopago/i);
 assert.doesNotMatch(html,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|<script src=/);
 assert.match(script,/get\('verifiedPassword'\)\.value=''/);
 assert.match(script,/get\('samePassword'\)\.checked\?password/);
});

test('flujo autorizado: JWT genuino simulado antes y después, cierre global y rechazo correo pendiente',async()=>{
 const h=harness();
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('PASS: Supabase Auth emitió')));
 assert.ok(rows.some(x=>x.includes('PASS: Antes del cierre')));
 assert.ok(rows.some(x=>x.includes('PASS: Tras el cierre: mismo JWT')));
 assert.ok(rows.some(x=>x.includes('PASS: Cuenta pendiente rechazada')));
 assert.ok(rows.some(x=>x.includes('PASS: Diagnóstico completo sin errores')));
 assert.ok(!rows.some(x=>x.includes('FAIL:')));
 assert.equal(h.logoutCalls,1);
 assert.equal(h.nodes.get('verifiedPassword').value,'');
 assert.equal(h.nodes.get('pendingPassword').value,'');
 const catRequests=h.requests.filter(x=>x.pathname==='/rest/v1/catalog_categories');
 assert.equal(catRequests.length,2);
 assert.equal(catRequests[0].auth,catRequests[1].auth,'Se debe usar exactamente el JWT viejo');
 assert.equal(catRequests[0].auth,'Bearer '+token);
 await h.copy();
 const report=h.reportCopies.at(-1);
 assert.ok(report.includes('PASS: Tras el cierre'));
 for(const secret of [privatePassword,emailGood,emailPending,token,uid,sid]){
  assert.ok(!report.includes(secret),'El resultado copiado no puede mostrar credenciales o JWT');
 }
});

test('falla cerrado si un JWT revocado TODAVÍA lee categorías',async()=>{
 const h=harness({leak:true});
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('FAIL: Tras el cierre: mismo JWT')));
 assert.ok(rows.some(x=>x.includes('FAIL: Diagnóstico completo sin errores')));
});

test('falla cerrado si Auth no acepta el logout global y vuelve a intentar cleanup',async()=>{
 const h=harness({logoutError:true});
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('FAIL: Supabase Auth aceptó el cierre global')));
 assert.ok(rows.some(x=>x.includes('FAIL: Diagnóstico completo sin errores')));
 assert.ok(h.logoutCalls>=2);
 assert.ok(!rows.some(x=>x.includes('PASS: Tras el cierre')));
});

test('falla cerrado si login de cuenta confirmada es incorrecto',async()=>{
 const h=harness({firstLoginError:true});
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('FAIL: La cuenta confirmada inicia')));
 assert.ok(rows.some(x=>x.includes('FAIL: Diagnóstico completo sin errores')));
});

test('falla cerrado si la cuenta sin confirmar logra iniciar sesión',async()=>{
 const h=harness({pendingAllowed:true});
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('FAIL: Cuenta pendiente rechazada')));
 assert.ok(rows.some(x=>x.includes('FAIL: Diagnóstico completo sin errores')));
 assert.equal(h.logoutCalls,2,'Si falla la política email, el script cierra la sesión creada');
});

test('errores de red nunca imprimen secretos y se hace logout de emergencia',async()=>{
 const h=harness({networkError:true});
 const rows=await h.execute();
 assert.ok(rows.some(x=>x.includes('FAIL: Conexión Auth/PostgREST')));
 assert.ok(rows.some(x=>x.includes('FAIL: Diagnóstico completo sin errores')));
 assert.equal(h.logoutCalls,1);
 assert.ok(!rows.join(' ').includes(privatePassword));
 assert.equal(h.nodes.get('verifiedPassword').value,'');
});
