import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarInventarioDevD036,HISTORIAL_DEV_VALIDADO_D036}
 from '../../scripts/ci/dev-readiness-d036.mjs';
const baseline=()=>({
 pgVersionNum:170011,
 migrations:HISTORIAL_DEV_VALIDADO_D036.map(x=>({...x})),
 newRolesCount:0,newTablesCount:0,newFunctionsCount:0,
 sessionCheckerOwner:'postgres',sessionCheckerDefiner:true,
 registrationEnabled:false,iaAutoEnabled:false,iaCronCount:0,
 publicBaselineMissingRls:0
});
test('D036: 12 base + 5 laboratorio IA, inventario consistente NO permite instalar',()=>{
 const result=evaluarInventarioDevD036(baseline());
 assert.equal(HISTORIAL_DEV_VALIDADO_D036.length,17);
 assert.equal(result.estado,'BASELINE_DEV_CONSISTENTE');
 assert.equal(result.autorizaInstalacion,false);
 assert.ok(result.puertasPendientes.some(x=>/Backup real/.test(x)));
 assert.ok(result.puertasPendientes.some(x=>/usuarios autenticados reales/.test(x)));
});
test('D036: el historial antiguo de solo doce migraciones NO alcanza',()=>{
 const v=baseline();v.migrations=v.migrations.slice(0,12);
 const out=evaluarInventarioDevD036(v);
 assert.equal(out.estado,'BLOQUEADO');
 assert.ok(out.errores.includes('historial_migraciones_desconocido'));
});
test('D036: drift de nombre/version, orden o migration extra bloquea',()=>{
 for(const mutate of [
  v=>{v.migrations[13].name='otra_migracion'},
  v=>{v.migrations[16].version='20261030194857'},
  v=>{v.migrations.reverse()},
  v=>{v.migrations.push({version:'20270101',name:'unknown'})}
 ]){
  const v=baseline();mutate(v);assert.equal(evaluarInventarioDevD036(v).estado,'BLOQUEADO');
 }
});
test('D036: cualquier instalación parcial y privilegios expuestos bloquean',()=>{
 for(const [field,value] of [
  ['newRolesCount',1],['newTablesCount',1],['newFunctionsCount',1],
  ['sessionCheckerOwner','authenticated'],['sessionCheckerDefiner',false],
  ['publicBaselineMissingRls',1],['pgVersionNum',150000]
 ]){
  const v=baseline();v[field]=value;
  const o=evaluarInventarioDevD036(v);
  assert.equal(o.estado,'BLOQUEADO',field);
  assert.equal(o.autorizaInstalacion,false);
 }
});
test('D036: una automatización o registro inesperado bloquean',()=>{
 for(const [field,value] of [
  ['registrationEnabled',true],['iaAutoEnabled',true],['iaCronCount',1],
  ['iaCronCount',null],['iaAutoEnabled',null]
 ]){
  const v=baseline();v[field]=value;
  assert.equal(evaluarInventarioDevD036(v).estado,'BLOQUEADO',field);
 }
});
test('D036: objeto incompleto, campos adicionales o contenido no confiable bloquea',()=>{
 for(const v of [
  null,undefined,{},[],{...baseline(),una_clave_inesperada:'x'},
  {...baseline(),newRolesCount:'0'},
  {...baseline(),migrations:[null,...HISTORIAL_DEV_VALIDADO_D036.slice(1)]}
 ]){
  const x=evaluarInventarioDevD036(v);
  assert.equal(x.estado,'BLOQUEADO');assert.equal(x.autorizaInstalacion,false);
 }
});
test('D036: estado positivo jamás sustituye autorización humana de instalación',()=>{
 const r=evaluarInventarioDevD036(baseline());
 assert.equal(r.autorizaInstalacion,false);
 assert.ok(r.puertasPendientes.length>=4);
 assert.ok(Object.isFrozen(r));
});
