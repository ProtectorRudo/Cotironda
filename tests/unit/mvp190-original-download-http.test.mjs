import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {procesarDescargaOriginalMvp190 as serve} from
 '../../src/server/originales-descarga-http-mvp190.ts';
import {evaluarDescargaOriginalMvp161 as guard} from
 '../../src/domain/descarga-originales-mvp161.ts';

const T=1800000000000;
const RID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const DOC='a3c659f4-40b7-4fbe-9246-c2de912811a3';
const OTHER='b9cc4a02-808f-4e78-a89a-3c601a288faa';
const H='a'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.7\nCOTIRONDA-ORIGINAL-TEST\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const filename='cotironda-original-'+DOC.slice(0,8)+'.pdf';
const request=(id=DOC)=>new Request('https://cotironda.test/api/rondas/'+RID+
 '/originales/'+id,{method:'GET'});
const session=()=>({
 usuarioId:'persona_alfa',empresaId:'empresa_alfa',autenticada:true,
 identidadVerificada:true,anonima:false,
 rol:'buyer',venceMs:T+1000000,revocadaMs:null
});
function context(id=DOC,opts={}){
 const item={
  documentoId:id,
  autorizacion:{
   ahoraMs:T+800000,politicaDesdeMs:T-900000,
   ronda:{id:RID,empresaId:'empresa_alfa',compradorId:'persona_alfa',
    estado:'closed',creadaMs:T-800000,venceMs:T+300000,
    cerradaMs:T+310000},
   sesion:{autenticada:true,rol:'buyer',usuarioId:'persona_alfa',
    empresaId:'empresa_alfa',venceMs:T+1000000,revocadaMs:null},
   invitacion:{rondaId:RID,proveedorId:'comercio_bbb',enviadaMs:T-500000},
   consentimiento:{rondaId:RID,proveedorId:'comercio_bbb',
    alcance:'original_identificable_tras_cierre',version:'cotironda-originales-v1',
    aceptadoMs:T-600000,revocadoMs:null},
   archivo:{rondaId:RID,proveedorId:'comercio_bbb',mensajeHmac:H,
    bucket:'cotironda-piloto-originals',ruta:'media/'+H,mime:'application/pdf',
    bytes:bytes.length,sha256:sha,recibidoMs:T-200000,
    vigente:true,almacenado:true},
   prueba:{rondaId:RID,proveedorId:'comercio_bbb',sha256:sha,
    verificada:true,revisionVigente:true}
  }
 };
 for(const [key,value] of Object.entries(opts))
  if(key==='documentoId')item.documentoId=value;
  else if(key==='autorizacion')Object.assign(item.autorizacion,value);
  else Object.assign(item.autorizacion[key],value);
 return item;
}
function fixture(){
 const calls={sessions:0,contexts:0,files:0,links:0,requested:[]};
 return {
  calls,enabled:true,now:T+800000,
  session:session(),first:context(),second:context(),
  data:bytes,linkFirst:true,linkSecond:true,
  make(){
   return {
    habilitado:this.enabled,ahora:()=>this.now,
    verificarSesion:async()=>{calls.sessions++;return structuredClone(this.session)},
    verificarVinculoPiloto:async id=>{
     calls.links++;
     assert.equal(id,RID);
     return calls.links===1?this.linkFirst:this.linkSecond;
    },
    leerContexto:async selector=>{
     calls.contexts++;calls.requested.push(selector);
     return structuredClone(calls.contexts===1?this.first:this.second)
    },
    leerArchivo:async(bucket,path)=>{
     calls.files++;calls.requested.push({bucket,path});
     return this.data
    }
   };
  }
 };
}
test('MVP190: GET autorizado sirve ORIGINAL exactamente, sin URL firmada ni identidad',async()=>{
 const f=fixture(),res=await serve(request(),RID,DOC,f.make());
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'application/pdf');
 assert.equal(res.headers.get('content-length'),String(bytes.length));
 assert.equal(res.headers.get('content-disposition'),
  'attachment; filename="'+filename+'"');
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.match(res.headers.get('content-security-policy'),/sandbox/);
 assert.equal(res.headers.get('referrer-policy'),'no-referrer');
 assert.deepEqual(new Uint8Array(await res.arrayBuffer()),bytes);
 assert.deepEqual([f.calls.sessions,f.calls.contexts,f.calls.files,f.calls.links],
  [2,2,1,2]);
 assert.deepEqual(f.calls.requested[0],{
  rondaId:RID,documentoId:DOC,usuarioId:'persona_alfa',empresaId:'empresa_alfa'
 });
 assert.deepEqual(f.calls.requested[1],{
  bucket:'cotironda-piloto-originals',path:'media/'+H
 });
 for(const secret of [sha,H,'comercio_bbb','empresa_alfa'])
  assert.ok(!JSON.stringify([...res.headers]).includes(secret),secret);
});
test('MVP190: feature OFF, POST, token en URL, IDs inválidos detienen antes de Storage',async()=>{
 for(const [req,rid,doc,enabled,code] of [
  [request(),RID,DOC,false,503],
  [new Request(request().url,{method:'POST'}),RID,DOC,true,405],
  [new Request(request().url+'?token=compartido'),RID,DOC,true,400],
  [request(),'invalid',DOC,true,400],
  [request(),RID,'not_uuid',true,400]
 ]){
  const f=fixture();f.enabled=enabled;
  const res=await serve(req,rid,doc,f.make());
  assert.equal(res.status,code);
  assert.equal(f.calls.sessions,0);
  assert.equal(f.calls.contexts,0);
  assert.equal(f.calls.files,0);
  assert.match(res.headers.get('cache-control'),/no-store/);
 }
});
test('MVP190: sesión inexistente, suplente o caducada no consulta archivo',async()=>{
 const variations=[
  null,{...session(),usuarioId:'persona_otro'},
  {...session(),empresaId:'empresa_otra'},
  {...session(),rol:'supplier'},
  {...session(),venceMs:T+100},
  {...session(),revocadaMs:T-1},
  {...session(),autenticada:false},
  {...session(),identidadVerificada:false},
  {...session(),anonima:true}
 ];
 for(const actor of variations){
  const f=fixture();f.session=actor;
  const res=await serve(request(),RID,DOC,f.make());
  assert.notEqual(res.status,200);
  assert.equal(f.calls.files,0);
 }
});
test('MVP190: no descargas sin consentimiento voluntario, posterior a política y ronda',async()=>{
 const cases=[
  x=>{x.autorizacion.consentimiento=null},
  x=>{x.autorizacion.consentimiento.revocadoMs=T-100},
  x=>{x.autorizacion.consentimiento.aceptadoMs=T-950000},
  x=>{x.autorizacion.consentimiento.aceptadoMs=T-850000},
  x=>{x.autorizacion.consentimiento.aceptadoMs=T-400000},
  x=>{x.autorizacion.consentimiento.proveedorId='otro_negocio'},
  x=>{x.autorizacion.politicaDesdeMs=T-700000},
  x=>{x.autorizacion.ronda.creadaMs=T-950000},
  x=>{x.autorizacion.ronda.estado='prepared'},
  x=>{x.autorizacion.ronda.cerradaMs=T+200000},
  x=>{x.autorizacion.sesion.empresaId='otra_empresa'},
  x=>{x.autorizacion.prueba.revisionVigente=false},
  x=>{x.autorizacion.archivo.vigente=false}
 ];
 for(const patch of cases){
  const f=fixture();patch(f.first);
  const res=await serve(request(),RID,DOC,f.make());
  assert.equal(res.status,404,JSON.stringify(f.first).slice(0,180));
  assert.equal(f.calls.files,0);
 }
});
test('MVP190: el SHA de Storage se calcula sobre bytes, no se confía en metadatos',async()=>{
 for(const bad of [
  new TextEncoder().encode('otro PDF pero metadatos iguales'),
  new Uint8Array(),new Uint8Array(8388609)
 ]){
  const f=fixture();f.data=bad;
  const res=await serve(request(),RID,DOC,f.make());
  assert.equal(res.status,404);
  assert.equal(f.calls.contexts,1);
 }
});
test('MVP190: rehúsa documentos de otro proveedor, otra ronda o alias HMAC de Storage',async()=>{
 const patches=[
  x=>{x.documentoId=OTHER},
  x=>{x.autorizacion.ronda.id=OTHER},
  x=>{x.autorizacion.archivo.proveedorId='proveedor_ajeno'},
  x=>{x.autorizacion.archivo.ruta='media/otro'},
  x=>{x.autorizacion.archivo.sha256='c'.repeat(64)},
  x=>{x.autorizacion.prueba.sha256='c'.repeat(64)}
 ];
 for(const patch of patches){
  const f=fixture();patch(f.first);
  const res=await serve(request(),RID,DOC,f.make());
  assert.equal(res.status,404);
  assert.equal(f.calls.files,0);
 }
});
test('MVP190: revocación, revisión o cambio de fuente MIENTRAS se lee bloquea entrega',async()=>{
 for(const patch of [
  x=>{x.autorizacion.consentimiento.revocadoMs=T+800050},
  x=>{x.autorizacion.ronda.estado='cancelled'},
  x=>{x.autorizacion.archivo.sha256='e'.repeat(64)},
  x=>{x.autorizacion.archivo.mensajeHmac='b'.repeat(64);
    x.autorizacion.archivo.ruta='media/'+'b'.repeat(64)},
  x=>{x.autorizacion.prueba.revisionVigente=false},
  x=>{x.autorizacion.politicaDesdeMs=T-700000},
  x=>{x.autorizacion.invitacion.enviadaMs=T-450000}
 ]){
  const f=fixture();patch(f.second);
  const res=await serve(request(),RID,DOC,f.make());
  assert.equal(res.status,404);
  assert.equal(f.calls.files,1);
  assert.equal(f.calls.contexts,2);
 }
});
test('MVP190: sesión revocada durante lectura bloquea después de descargar bytes',async()=>{
 const f=fixture(),base=f.make();
 const dep={...base,verificarSesion:async()=>{
  f.calls.sessions++;
  if(f.calls.sessions>1)return null;
  return session();
 }};
 const res=await serve(request(),RID,DOC,dep);
 assert.equal(res.status,404);
 assert.equal(f.calls.files,1);
 assert.equal(f.calls.contexts,1);
});
test('MVP190: permite cada documento elegible sin depender de ranking ni adjudicación',async()=>{
 for(const [doc,mime,ext] of [
  [DOC,'application/pdf','pdf'],
  [OTHER,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx']
 ]){
  const f=fixture();f.first=context(doc);f.second=context(doc);
  f.first.autorizacion.archivo.mime=mime;
  f.second.autorizacion.archivo.mime=mime;
  const res=await serve(request(doc),RID,doc,f.make());
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-disposition'),new RegExp('\\.'+ext+'"$'));
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()),bytes);
 }
});
test('MVP190: jamás filtra datos privados en error, ni permite MIME activo',async()=>{
 const f=fixture();f.first.autorizacion.archivo.mime='text/html';
 const res=await serve(request(),RID,DOC,f.make());
 assert.equal(res.status,404);
 const body=await res.text();
 for(const secret of [RID,H,sha,'comercio_bbb','text/html',
  'cotironda-piloto-originals'])assert.ok(!body.includes(secret),secret);
 const src=readFileSync(new URL(
  '../../src/server/originales-descarga-http-mvp190.ts',import.meta.url),'utf8');
 assert.doesNotMatch(src,/createSignedUrl|signedUrl|createSignedUploadUrl/);
 assert.match(src,/evaluarDescargaOriginalMvp161/);
 assert.match(src,/crypto\.subtle\.digest\('SHA-256'/);
});
test('MVP190: protección extra contra consentimiento capturado antes de crear ronda',()=>{
 const f=fixture().first.autorizacion;
 assert.equal(guard(f).permitido,true);
 assert.equal(guard({...f,consentimiento:{...f.consentimiento,
  aceptadoMs:f.ronda.creadaMs-1}}).permitido,false);
 assert.equal(guard({...f,consentimiento:{...f.consentimiento,
  aceptadoMs:f.politicaDesdeMs-1}}).permitido,false);
});

test('MVP191: vínculo Auth-WhatsApp obligatorio antes de leer un archivo',async()=>{
 const f=fixture();f.linkFirst=false;
 const res=await serve(request(),RID,DOC,f.make());
 assert.equal(res.status,404);
 assert.deepEqual([f.calls.sessions,f.calls.links,f.calls.contexts,f.calls.files],
  [1,1,0,0]);
});

test('MVP191: baja de vínculo Auth-WhatsApp durante Storage impide devolver bytes',async()=>{
 const f=fixture();f.linkSecond=false;
 const res=await serve(request(),RID,DOC,f.make());
 assert.equal(res.status,404);
 assert.deepEqual([f.calls.sessions,f.calls.links,f.calls.contexts,f.calls.files],
  [2,2,1,1]);
});
