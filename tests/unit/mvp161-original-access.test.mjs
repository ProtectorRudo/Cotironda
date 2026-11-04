import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarDescargaOriginalMvp161 as check} from '../../src/domain/descarga-originales-mvp161.ts';
const T=1800000000000,R='469cb459-5f00-49c2-b0b9-bc8b11e5c900',H='a'.repeat(64),M='b'.repeat(64);
const f=()=>({
 ahoraMs:T+800000,politicaDesdeMs:T-900000,
 ronda:{id:R,empresaId:'empresa_alfa',compradorId:'persona_alfa',estado:'closed',
  creadaMs:T-800000,venceMs:T+300000,cerradaMs:T+310000},
 sesion:{autenticada:true,rol:'buyer',usuarioId:'persona_alfa',empresaId:'empresa_alfa',
  venceMs:T+1000000,revocadaMs:null},
 invitacion:{rondaId:R,proveedorId:'comercio_bbb',enviadaMs:T-500000},
 consentimiento:{rondaId:R,proveedorId:'comercio_bbb',
  alcance:'original_identificable_tras_cierre',
  version:'cotironda-originales-v1',aceptadoMs:T-600000,revocadoMs:null},
 archivo:{rondaId:R,proveedorId:'comercio_bbb',mensajeHmac:M,
  bucket:'cotironda-piloto-originals',ruta:'media/'+M,mime:'application/pdf',
  bytes:900,sha256:H,recibidoMs:T-200000,vigente:true,almacenado:true},
 prueba:{rondaId:R,proveedorId:'comercio_bbb',sha256:H,verificada:true,revisionVigente:true}
});
test('MVP161: TODOS los candidatos autorizados, no solo recomendados',()=>{
 const result=check(f());
 assert.deepEqual(result,{permitido:true,motivo:'autorizado'});
 assert.equal('ranking' in f(),false);
});
test('MVP161: cerrado y tras el plazo, no anticipar o liberar cancelado',()=>{
 const base=f();
 for(const ronda of [
  {...base.ronda,estado:'prepared',cerradaMs:null},
  {...base.ronda,estado:'cancelled'},
  {...base.ronda,cerradaMs:base.ronda.venceMs-1}
 ])assert.equal(check({...base,ronda}).motivo,'ronda_abierta');
});
test('MVP161: autenticación y organización no son el token de WhatsApp',()=>{
 const base=f();
 for(const sesion of [
  {...base.sesion,autenticada:false},
  {...base.sesion,rol:'supplier'},
  {...base.sesion,empresaId:'empresa_otra'},
  {...base.sesion,usuarioId:'persona_otra'},
  {...base.sesion,venceMs:T-1},
  {...base.sesion,revocadaMs:T-1}
 ])assert.equal(check({...base,sesion}).motivo,'comprador_no_autorizado');
});
test('MVP161: consentimiento por ronda antes de invitación, no retroactivo',()=>{
 const base=f();
 for(const consentimiento of [
  null,
  {...base.consentimiento,proveedorId:'comercio_otra'},
  {...base.consentimiento,version:'vieja'},
  {...base.consentimiento,revocadoMs:T-1},
  {...base.consentimiento,aceptadoMs:base.invitacion.enviadaMs+1}
 ])assert.equal(check({...base,consentimiento}).motivo,'sin_consentimiento');
 assert.equal(check({...base,politicaDesdeMs:T-700000}).motivo,'politica_no_aplicable');
});
test('MVP161: requiere fuente SHA, ruta privada, MIME y revisión vigente',()=>{
 const base=f();
 for(const altered of [
  {archivo:{...base.archivo,sha256:'c'.repeat(64)}},
  {archivo:{...base.archivo,ruta:'media/ajeno'}},
  {archivo:{...base.archivo,bucket:'public'}},
  {archivo:{...base.archivo,mime:'text/html'}},
  {archivo:{...base.archivo,recibidoMs:base.ronda.venceMs+1}},
  {archivo:{...base.archivo,vigente:false}},
  {prueba:{...base.prueba,verificada:false}},
  {prueba:{...base.prueba,sha256:'c'.repeat(64)}},
  {invitacion:{...base.invitacion,proveedorId:'comercio_otra'}}
 ])assert.equal(check({...base,...altered}).motivo,'fuente_no_verificada');
});
test('MVP161: admite formatos originales sin convertirlos',()=>{
 const base=f();for(const mime of ['application/pdf','image/jpeg','image/png',
  'image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']){
  assert.equal(check({...base,archivo:{...base.archivo,mime}}).permitido,true);
 }
});
test('MVP161: no entrega URL, contacto ni datos privados al comprador',()=>{
 const r=check(f());
 assert.deepEqual(Object.keys(r).sort(),['motivo','permitido']);
 assert.equal(JSON.stringify(r).includes('http'),false);
});
