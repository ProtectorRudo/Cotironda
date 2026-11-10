import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {listarOriginalesPiloto,descargarOriginalPiloto} from
 '../../src/server/originales-piloto-conexion-segura.ts';

const T=1800000000000;
const RID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const DOC='a3c659f4-40b7-4fbe-a246-c2de912811a3';
const DOC2='b9cc4a02-808f-4e78-a89a-3c601a288faa';
const USER='b9000000-1111-4111-a111-111111111111';
const OTHER_USER='b9000000-1111-4111-a111-111111111112';
const SESSION='c9000000-1111-4111-a111-111111111111';
const OTHER_SESSION='c9000000-1111-4111-a111-111111111112';
const COMPANY='buyer_empresa_a';
const H='a'.repeat(64);
const FILE=new TextEncoder().encode('%PDF-1.7\\nPrueba de original íntegro\\n');
const SHA=createHash('sha256').update(FILE).digest('hex');
const identity=()=>({
 usuarioId:USER,empresaId:COMPANY,authSessionId:SESSION,autenticada:true,
 rol:'buyer',identidadVerificada:true,anonima:false,revocadaMs:null,
 venceMs:T+1000000
});
const source=(documentId=DOC)=>({
 state:'authorized_original',documentoId:documentId,
 autorizacion:{
  politicaDesdeMs:T-900000,
  ronda:{id:RID,compradorId:USER,empresaId:COMPANY,
   estado:'closed',creadaMs:T-800000,venceMs:T+300000,cerradaMs:T+310000},
  invitacion:{rondaId:RID,proveedorId:'corralon_a',enviadaMs:T-500000},
  consentimiento:{rondaId:RID,proveedorId:'corralon_a',
   alcance:'original_identificable_tras_cierre',version:'cotironda-originales-v1',
   aceptadoMs:T-600000,revocadoMs:null},
  archivo:{rondaId:RID,proveedorId:'corralon_a',mensajeHmac:H,
   bucket:'cotironda-piloto-originals',ruta:'media/'+H,mime:'application/pdf',
   bytes:FILE.byteLength,sha256:SHA,recibidoMs:T-200000,
   vigente:true,almacenado:true},
  prueba:{rondaId:RID,proveedorId:'corralon_a',sha256:SHA,
   verificada:true,revisionVigente:true},
  sesion:{usuarioId:'injected',rol:'admin',empresaId:'other',autenticada:true}
 }
});
const catalog=()=>({
 state:'authorized_catalog',total:2,originals:[
  {documentId:DOC,mime:'application/pdf',kind:'document',
   supplierPhone:'+549000000',storage_path:'private/HMAC'},
  {documentId:DOC2,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   kind:'document',buyerEmail:'secret@example.test'}
 ],contact:'hidden',sourceHmac:H
});
function fixture(){
 const state={on:true,auth:identity(),linked:true,now:T+800000,
  source:source(),catalog:catalog(),data:FILE,
  queries:[],reads:[],links:0,authCalls:0,readCallback:null,
  audit:[],auditOK:true};
 const deps={
  get habilitado(){return state.on},
  ahora:()=>state.now,
  verificarSesionAutentica:async()=>{
   state.authCalls++;
   return state.auth?structuredClone(state.auth):null;
  },
  verificarVinculoPiloto:async id=>{
   state.links++;assert.equal(id,RID);
   return state.linked;
  },
  consultarOriginalesPrivados:async q=>{
   state.queries.push(structuredClone(q));
   return structuredClone(q.documentoId===null?state.catalog:state.source);
  },
  leerArchivo:async(bucket,ruta)=>{
   state.reads.push({bucket,ruta});
   state.readCallback?.();
   return state.data;
  },
  registrarDescarga:async event=>{
   state.audit.push(structuredClone(event));
   return state.auditOK;
  }
 };
 return {state,deps};
}
function request(doc=DOC,urlExtra=''){
 return new Request('https://test.invalid/rondas/'+RID+'/originales/'+doc+
 urlExtra,{method:'GET'});
}

test('Integra catálogo de TODOS los candidatos consentidos, minimizando salida privada',async()=>{
 const f=fixture();
 const result=await listarOriginalesPiloto(RID,f.deps);
 assert.equal(result?.total,2);
 assert.deepEqual(result.documentos.map(x=>x.documentoId),[DOC,DOC2]);
 const printed=JSON.stringify(result);
 for(const secret of ['supplierPhone','storage_path','buyerEmail',
  'sourceHmac','corralon_a',H,'@'])assert.ok(!printed.includes(secret),secret);
 assert.equal(f.state.queries.length,1);
 assert.deepEqual(f.state.queries[0],{
  rondaId:RID,usuarioId:USER,authSessionId:SESSION,documentoId:null
 });
 assert.equal(f.state.links,2,'vínculo revalidado después de consultar');
});

test('Un piloto sin Auth/sesión/política activada falla cerrado sin leer Storage',async()=>{
 for(const patch of [
  x=>{x.on=false},x=>{x.auth=null},x=>{x.linked=false},
  x=>{x.auth.rol='supplier'},x=>{x.auth.anonima=true},
  x=>{x.auth.venceMs=T-1},x=>{x.auth.identidadVerificada=false},
  x=>{x.auth.authSessionId='from-url'}
 ]){
  const f=fixture();patch(f.state);
  assert.equal(await listarOriginalesPiloto(RID,f.deps),null);
  assert.equal(f.state.queries.length,0);
  assert.equal(f.state.reads.length,0);
 }
});

test('Una sesión cambiada durante el catálogo no muestra documentos',async()=>{
 const f=fixture();
 const callback=f.deps.consultarOriginalesPrivados;
 f.deps.consultarOriginalesPrivados=async q=>{
  const v=await callback(q);
  f.state.auth.authSessionId=OTHER_SESSION;
  return v;
 };
 assert.equal(await listarOriginalesPiloto(RID,f.deps),null);
 assert.equal(f.state.queries.length,1);
});

test('Catálogo falso, corrupto y referencias duplicadas no se publican',async()=>{
 for(const alteration of [
  x=>{x.total=3},x=>{x.state='closed'},x=>{x.originals[0].mime='text/html'},
  x=>{x.originals[1].documentId=DOC},x=>{x.originals[0].documentId='../secret'}
 ]){
  const f=fixture();alteration(f.state.catalog);
  assert.equal(await listarOriginalesPiloto(RID,f.deps),null);
 }
});

test('GET original autorizado: misma sesión, selector y hash, bytes exactos',async()=>{
 const f=fixture();
 const res=await descargarOriginalPiloto(request(),RID,DOC,f.deps);
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-disposition'),/attachment/);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.deepEqual(new Uint8Array(await res.arrayBuffer()),FILE);
 assert.equal(f.state.reads.length,1);
 assert.deepEqual(f.state.audit,[{
  rondaId:RID,documentoId:DOC,usuarioId:USER,empresaId:COMPANY,
  sourceSha256:SHA,byteCount:FILE.byteLength
 }]);
 assert.deepEqual(f.state.reads[0],{
  bucket:'cotironda-piloto-originals',ruta:'media/'+H
 });
 assert.equal(f.state.queries.length,2,'vuelve a leer fuente después del I/O');
 assert.ok(f.state.queries.every(q=>q.authSessionId===SESSION&&
  q.usuarioId===USER&&q.documentoId===DOC));
 const headers=JSON.stringify([...res.headers]);
 assert.doesNotMatch(headers,/sourceHmac|corralon_a|\bmedia\//);
});

test('Si no se logra auditar después de verificar SHA, deniega los bytes',async()=>{
 const f=fixture();f.state.auditOK=false;
 const res=await descargarOriginalPiloto(request(),RID,DOC,f.deps);
 assert.equal(res.status,503);
 assert.equal(f.state.reads.length,1);
 assert.equal(f.state.audit.length,1);
 assert.doesNotMatch(await res.text(),/corralon_a|media\/|[a-f0-9]{64}/u);
});

test('No sirve originales sin fuente consentida, ronda propia y vigente',async()=>{
 const cases=[
  x=>{x.autorizacion.ronda.empresaId='buyer_empresa_b'},
  x=>{x.autorizacion.ronda.compradorId=OTHER_USER},
  x=>{x.documentoId=DOC2},
  x=>{x.autorizacion.ronda.estado='prepared'},
  x=>{x.autorizacion.consentimiento.revocadoMs=T-100},
  x=>{x.autorizacion.consentimiento.aceptadoMs=T-999999},
  x=>{x.autorizacion.consentimiento=null},
  x=>{x.autorizacion.archivo.vigente=false},
  x=>{x.autorizacion.prueba.revisionVigente=false},
  x=>{x.autorizacion.archivo.ruta='media/'+ 'b'.repeat(64)}
 ];
 for(const change of cases){
  const f=fixture();change(f.state.source);
  const res=await descargarOriginalPiloto(request(),RID,DOC,f.deps);
  assert.equal(res.status,404);
  assert.equal(f.state.reads.length,0);
 }
});

test('Cambio de sesión durante Storage bloquea bytes aunque sea mismo usuario',async()=>{
 const f=fixture();
 f.state.readCallback=()=>{f.state.auth.authSessionId=OTHER_SESSION};
 const res=await descargarOriginalPiloto(request(),RID,DOC,f.deps);
 assert.equal(res.status,404);
 assert.equal(f.state.reads.length,1);
});

test('Revocación del consentimiento después de Storage bloquea entrega',async()=>{
 const f=fixture();
 f.state.readCallback=()=>{
  f.state.source.autorizacion.consentimiento.revocadoMs=T+800050;
 };
 const res=await descargarOriginalPiloto(request(),RID,DOC,f.deps);
 assert.equal(res.status,404);
 assert.equal(f.state.queries.length,2);
 assert.equal(f.state.reads.length,1);
});

test('Documento alterado o formato activo nunca genera respuesta de descarga',async()=>{
 const f=fixture();f.state.data=new TextEncoder().encode('archivo cambiado');
 assert.equal((await descargarOriginalPiloto(request(),RID,DOC,f.deps)).status,404);
 const g=fixture();g.state.source.autorizacion.archivo.mime='text/html';
 assert.equal((await descargarOriginalPiloto(request(),RID,DOC,g.deps)).status,404);
 assert.equal(g.state.reads.length,0);
});

test('No lee backend cuando flag OFF, POST, token en query o IDs inválidos',async()=>{
 for(const [off,req,rid,doc,expected] of [
  [true,request(),RID,DOC,503],
  [false,new Request(request().url,{method:'POST'}),RID,DOC,405],
  [false,request(DOC,'?token=de-whatsapp'),RID,DOC,400],
  [false,request(),'not-a-round',DOC,400],
  [false,request(),RID,'not-a-document',400]
 ]){
  const f=fixture();f.state.on=!off;
  const res=await descargarOriginalPiloto(req,rid,doc,f.deps);
  assert.equal(res.status,expected);
  assert.equal(f.state.queries.length,0);
  assert.equal(f.state.reads.length,0);
 }
});

test('No confunde enlace de seguimiento con identidad Auth: UUID y session_id reales obligatorios',async()=>{
 const f=fixture();f.state.auth.usuarioId='whatsapp-token-'+H;
 assert.equal(await listarOriginalesPiloto(RID,f.deps),null);
 assert.equal((await descargarOriginalPiloto(request(),RID,DOC,f.deps)).status,401);
 assert.equal(f.state.queries.length,0);
});

test('En una ronda sin originales consentidos la lista es vacía, no inventa descargas',async()=>{
 const f=fixture();f.state.catalog={
  state:'authorized_catalog',total:0,originals:[]
 };
 const r=await listarOriginalesPiloto(RID,f.deps);
 assert.equal(r?.total,0);
 assert.deepEqual(r.documentos,[]);
 assert.equal(f.state.reads.length,0);
});
