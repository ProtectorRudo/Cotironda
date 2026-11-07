import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bearerPiloto,claimsDeJwtValidado,conectarOriginalesAuthPiloto,
 originalesHTTPHabilitados,PILOT_REF}
 from '../../src/server/originales-piloto-http-runtime.ts';
import {listarOriginalesPiloto,descargarOriginalPiloto}
 from '../../src/server/originales-piloto-conexion-segura.ts';

const T=1800000000000;
const USER='b9000000-1111-4111-a111-111111111111';
const SESSION='c9000000-1111-4111-a111-111111111111';
const OTHER_SESSION='c9000000-1111-4111-a111-111111111112';
const ROUND='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const DOC='a3c659f4-40b7-4fbe-a246-c2de912811a3';
const ORG='buyer_empresa_a',H='a'.repeat(64);
const FILE=new TextEncoder().encode('%PDF-1.7 ORIGINAL PRUEBA');
const HASH=createHash('sha256').update(FILE).digest('hex');
const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=(overrides={})=>{
 const payload={iss:'https://'+PILOT_REF+'.supabase.co/auth/v1',
  aud:'authenticated',role:'authenticated',sub:USER,session_id:SESSION,
  exp:Math.floor(T/1000)+900,...overrides};
 return base64({alg:'HS256',typ:'JWT'})+'.'+base64(payload)+'.'+'x'.repeat(64);
};
const request=(token=jwt(),method='GET')=>new Request(
 'https://cotironda.test/api/piloto/originales/'+ROUND+
 (method==='GET'?'':''),
 {method,headers:token?{Authorization:'Bearer '+token}:{}});

function source(){
 return {state:'authorized_original',documentoId:DOC,autorizacion:{
  politicaDesdeMs:T-900000,
  ronda:{id:ROUND,empresaId:ORG,compradorId:USER,estado:'closed',
   creadaMs:T-800000,venceMs:T+300000,cerradaMs:T+310000},
  invitacion:{rondaId:ROUND,proveedorId:'supplier_123',enviadaMs:T-500000},
  consentimiento:{rondaId:ROUND,proveedorId:'supplier_123',
   alcance:'original_identificable_tras_cierre',version:'cotironda-originales-v1',
   aceptadoMs:T-600000,revocadoMs:null},
  archivo:{rondaId:ROUND,proveedorId:'supplier_123',mensajeHmac:H,
   bucket:'cotironda-piloto-originals',ruta:'media/'+H,
   mime:'application/pdf',bytes:FILE.length,sha256:HASH,recibidoMs:T-200000,
   vigente:true,almacenado:true},
  prueba:{rondaId:ROUND,proveedorId:'supplier_123',sha256:HASH,
   verificada:true,revisionVigente:true}
 }};
}
function fx(token=jwt()){
 const state={on:true,user:{
  id:USER,phone:'5492215551234',phone_confirmed_at:'2026-11-04T17:00:00Z',
  is_anonymous:false},buyer:true,org:ORG,policy:true,document:source(),
  bytes:FILE,queries:[],files:0,authCalls:0,buyerCalls:0,authChanged:false,
  audit:[],auditAvailable:true};
 const ports={
  getUser:async claim=>{state.authCalls++;
   return state.user&&claim===token?structuredClone(state.user):null},
  buyerIdentity:async(x,id)=>{state.buyerCalls++;
   assert.equal(x,token);assert.equal(id,ROUND);return state.buyer;},
  privateOriginals:async q=>{
   state.queries.push({...q});
   if(!state.policy)return null;
   if(q.documentoId!==null)return structuredClone(state.document);
   return {state:'authorized_catalog',buyerKey:state.org,total:1,
    originals:[{documentId:DOC,mime:'application/pdf',kind:'document'}],
    phoneSecret:'NO_PUBLICAR'};
  },
  readOriginal:async(bucket,path)=>{state.files++;
   assert.equal(bucket,'cotironda-piloto-originals');
   assert.equal(path,'media/'+H);
   if(state.authChanged)state.org='buyer_empresa_b';
   return state.bytes;
  },
  auditOriginal:async q=>{
   state.audit.push(structuredClone(q));
   return state.auditAvailable;
  }
 };
 const deps=conectarOriginalesAuthPiloto(request(token),ROUND,ports,true,()=>T+800000);
 return {state,ports,deps,token};
}

test('Flag OFF por defecto, solo proyecto PILOTO, entorno Preview y SHA exacto',()=>{
 const sha='e'.repeat(40);
 const env={
  COTIRONDA_PILOT_ORIGINALS_ENABLED:'true',
  VERCEL_ENV:'preview',COTIRONDA_REGISTRATION_ENABLED:'false',
  COTIRONDA_PILOT_SUPABASE_URL:'https://'+PILOT_REF+'.supabase.co',
  COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST',
  COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_TEST',
  VERCEL_GIT_COMMIT_SHA:sha,COTIRONDA_PILOT_ORIGINALS_RELEASE_SHA:sha
 };
 assert.equal(originalesHTTPHabilitados(env),true);
 for(const field of ['COTIRONDA_PILOT_ORIGINALS_ENABLED','VERCEL_ENV',
  'COTIRONDA_REGISTRATION_ENABLED','COTIRONDA_PILOT_SUPABASE_URL',
  'COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY',
  'COTIRONDA_PILOT_SUPABASE_SECRET_KEY','VERCEL_GIT_COMMIT_SHA',
  'COTIRONDA_PILOT_ORIGINALS_RELEASE_SHA']){
  assert.equal(originalesHTTPHabilitados({...env,[field]:'otro'}),false,field);
 }
 assert.equal(originalesHTTPHabilitados({}),false);
 assert.equal(originalesHTTPHabilitados({...env,VERCEL_ENV:'production'}),false);
 assert.equal(originalesHTTPHabilitados({...env,
  COTIRONDA_PILOT_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co'}),false);
});

test('JWT por Authorization header, nunca query ni token WhatsApp',()=>{
 const token=jwt();
 assert.equal(bearerPiloto(request(token)),token);
 assert.equal(bearerPiloto(request('')),null);
 assert.equal(bearerPiloto(new Request('https://example.test/?token='+H)),null);
 assert.equal(bearerPiloto(new Request('https://example.test',
  {headers:{Authorization:'Bearer '+H}})),null);
 assert.equal(bearerPiloto(new Request('https://example.test',
  {headers:{Authorization:'Basic abc'}})),null);
});

test('getUser validado + claims PILOTO verdaderos, rechaza DEV/exp/sub/sesión/rol',()=>{
 assert.deepEqual(claimsDeJwtValidado(jwt(),USER,T),{
  sub:USER,sessionId:SESSION,expiresMs:Math.floor(T/1000)*1000+900000
 });
 for(const patch of [
  {iss:'https://qkercsoqhehbenbbncwk.supabase.co/auth/v1'},
  {role:'anon'},{aud:'anon'},{sub:'b9000000-1111-4111-a111-111111111112'},
  {session_id:'fake'},{exp:Math.floor(T/1000)-1},{exp:0},
  {exp:'9999999999'}
 ])assert.equal(claimsDeJwtValidado(jwt(patch),USER,T),null,JSON.stringify(patch));
 assert.equal(claimsDeJwtValidado('not.jwt',USER,T),null);
});

test('Listado auténtico: el backend verifica identidad y deriva empresa SOLO del SQL',async()=>{
 const f=fx();
 const out=await listarOriginalesPiloto(ROUND,f.deps);
 assert.equal(out?.total,1);
 assert.equal(out.documentos[0].documentoId,DOC);
 assert.equal(out.documentos[0].nombre,'Presupuesto original 01');
 assert.ok(f.state.authCalls>=3);
 assert.ok(f.state.buyerCalls>=2);
 assert.ok(f.state.queries.every(q=>q.usuarioId===USER&&
  q.authSessionId===SESSION&&q.rondaId===ROUND));
 assert.doesNotMatch(JSON.stringify(out),/buyer_empresa_a|NO_PUBLICAR|supplier_123/);
});

test('Con permiso y hash fuente inmutable entrega bytes PDF exactos',async()=>{
 const f=fx();
 const res=await descargarOriginalPiloto(request(f.token),ROUND,DOC,f.deps);
 assert.equal(res.status,200);
 assert.deepEqual(new Uint8Array(await res.arrayBuffer()),FILE);
 assert.equal(f.state.files,1);
 assert.equal(f.state.audit.length,1);
 assert.deepEqual(f.state.audit[0],{
  rondaId:ROUND,documentoId:DOC,usuarioId:USER,empresaId:ORG,
  sourceSha256:HASH,byteCount:FILE.length,authSessionId:SESSION
 });
 assert.ok(f.state.queries.filter(x=>x.documentoId===DOC).length>=2);
 assert.match(res.headers.get('cache-control'),/no-store/);
});

test('Sin auditoría persistente no entrega bytes aunque SHA y sesión sean válidos',async()=>{
 const f=fx();f.state.auditAvailable=false;
 const res=await descargarOriginalPiloto(request(f.token),ROUND,DOC,f.deps);
 assert.equal(res.status,503);
 assert.equal(f.state.files,1);
 assert.equal(f.state.audit.length,1);
 assert.doesNotMatch(await res.text(),/seller_123|media\/|[a-f0-9]{64}/u);
});

test('Permiso revocado antes de auditar bloquea también la entrega',async()=>{
 const f=fx();
 f.ports.auditOriginal=async()=>{throw new Error('db_temporarily_offline')};
 const res=await descargarOriginalPiloto(request(f.token),ROUND,DOC,f.deps);
 assert.notEqual(res.status,200);
});

test('Sin usuario/teléfono confirmado/rol comprador no consulta originales ni Storage',async()=>{
 for(const alter of [
  f=>{f.user=null},f=>{f.user.phone_confirmed_at=null},
  f=>{f.user.phone=null},f=>{f.user.phone='invalido'},
  f=>{f.user.is_anonymous=true}
 ]){
  const f=fx();alter(f.state);
  assert.equal(await listarOriginalesPiloto(ROUND,f.deps),null);
  assert.equal(f.state.queries.length,0);
  assert.equal(f.state.files,0);
 }
});

test('Un comprador distinto o sesión sin vínculo con WhatsApp no accede',async()=>{
 for(const alter of [
  x=>{x.user.id='b9000000-1111-4111-a111-111111111112'},
  x=>{x.buyer=false},x=>{x.policy=false},
  x=>{x.org='buyer_empresa_no_valida!'}
 ]){
  const f=fx();alter(f.state);
  assert.equal(await listarOriginalesPiloto(ROUND,f.deps),null);
  assert.equal(f.state.files,0);
 }
});

test('Sin consentimiento del proveedor, archivo alterado o ronda abierta bloquea',async()=>{
 for(const alter of [
  x=>{x.document.autorizacion.consentimiento=null},
  x=>{x.document.autorizacion.consentimiento.revocadoMs=T+800000},
  x=>{x.document.autorizacion.ronda.estado='prepared'},
  x=>{x.document.autorizacion.ronda.empresaId='buyer_empresa_b'},
  x=>{x.document.autorizacion.archivo.sha256='b'.repeat(64)}
 ]){
  const f=fx();alter(f.state);
  const res=await descargarOriginalPiloto(request(f.token),ROUND,DOC,f.deps);
  assert.notEqual(res.status,200);
  assert.equal(f.state.files,0);
 }
});

test('Cambio de empresa durante Storage invalida sesión y no entrega bytes',async()=>{
 const f=fx();f.state.authChanged=true;
 const res=await descargarOriginalPiloto(request(f.token),ROUND,DOC,f.deps);
 assert.equal(res.status,404);
 assert.equal(f.state.files,1);
});

test('Política SQL retirada antes del acceso impide ver catálogo',async()=>{
 const f=fx();f.state.policy=false;
 assert.equal(await listarOriginalesPiloto(ROUND,f.deps),null);
 assert.equal(f.state.files,0);
});

test('Con bandera OFF ni siquiera se consulta Auth',async()=>{
 const f=fx();const deps={...f.deps,habilitado:false};
 assert.equal(await listarOriginalesPiloto(ROUND,deps),null);
 assert.equal((await descargarOriginalPiloto(request(f.token),ROUND,DOC,deps)).status,503);
 assert.equal(f.state.authCalls,0);
});

test('No filtra identidad privada por respuesta JSON del catálogo',async()=>{
 const f=fx();const o=await listarOriginalesPiloto(ROUND,f.deps);
 const printed=JSON.stringify(o);
 for(const forbidden of [ORG,'buyerKey','sourceHmac','NO_PUBLICAR',
  'supplier_123',H,'phone','storage_path'])
  assert.equal(printed.includes(forbidden),false,forbidden);
});
