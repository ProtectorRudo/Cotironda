import test from 'node:test';
import assert from 'node:assert/strict';
import { procesarAlta } from '../../src/server/registro-http.ts';
const origen = 'https://cotironda-dev.example';
const actor = { userId:'123e4567-e89b-42d3-a456-426614174000', emailVerificado:true, anonimo:false };
const payload = { requestId:'923e4567-e89b-42d3-a456-426614174001', nombre:'Constructora Sur', tipo:'supplier', nombreComercial:'Materiales Sur' };
const alta = (body=payload, origin=origen) => new Request(origen+'/api/organizaciones', {
  method:'POST',headers:{'content-type':'application/json','origin':origin},body:typeof body==='string'?body:JSON.stringify(body)
});
const deps = (extra={}) => ({
  originPermitido:origen, configurado:true,
  verificarSesion:async()=>actor, autorizarIntento:async()=>true,
  persistencia:{async crearEmpresaConPropietario(input){return {organizationId:'123e4567-e89b-42d3-a456-426614174002',replay:false};}},
  ...extra
});
test('éxito devuelve 201 y no expone información de otra empresa',async()=>{
  const r=await procesarAlta(alta(),deps());
  assert.equal(r.status,201);
  assert.deepEqual(Object.keys(await r.json()).sort(),['organizationId','replay']);
  assert.equal(r.headers.get('cache-control'),'no-store');
});
test('reintento confirmado devuelve 200',async()=>{
  const r=await procesarAlta(alta(),deps({persistencia:{crearEmpresaConPropietario:async()=>({organizationId:'org-1',replay:true})}}));
  assert.equal(r.status,200);
});
test('sin configuración no intenta autenticar',async()=>{
  const r=await procesarAlta(alta(),deps({configurado:false,verificarSesion:async()=>{throw Error('NO')}}));
  assert.equal(r.status,503);
});
test('rechaza origen distinto y ausente',async()=>{
  assert.equal((await procesarAlta(alta(payload,'https://malicioso.example'),deps())).status,403);
  const r=await procesarAlta(new Request(origen,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),deps());
  assert.equal(r.status,403);
});
test('no permite GET',async()=>{
  const r=await procesarAlta(new Request(origen,{method:'GET'}),deps());
  assert.equal(r.status,405);
});
test('no permite cuerpo de otro tipo',async()=>{
  const r=await procesarAlta(new Request(origen,{method:'POST',headers:{origin:origen,'content-type':'text/plain'},body:'hola'}),deps());
  assert.equal(r.status,415);
});
test('no permite usuario anónimo o no verificado',async()=>{
  for(const candidate of [null,{...actor,anonimo:true},{...actor,emailVerificado:false}]){
    assert.equal((await procesarAlta(alta(),deps({verificarSesion:async()=>candidate}))).status,401);
  }
});
test('rate limit fail closed',async()=>{
  assert.equal((await procesarAlta(alta(),deps({autorizarIntento:async()=>false}))).status,429);
  assert.equal((await procesarAlta(alta(),deps({autorizarIntento:async()=>{throw Error('timeout')}}))).status,503);
});
test('limita el tamaño del JSON',async()=>{
  assert.equal((await procesarAlta(alta('x'.repeat(11000)),deps())).status,413);
});
test('rechaza JSON malformado',async()=>{
  assert.equal((await procesarAlta(alta('{'),deps())).status,400);
});
test('no acepta autoasignarse roles',async()=>{
  const r=await procesarAlta(alta({...payload,role:'owner'}),deps());
  assert.equal(r.status,400);
  assert.equal((await r.json()).error,'campo_no_permitido');
});
test('error DB no filtra detalles internos ni secretos',async()=>{
  const r=await procesarAlta(alta(),deps({persistencia:{crearEmpresaConPropietario:async()=>{throw Error('secret=1234')}}}));
  assert.equal(r.status,503);
  assert.doesNotMatch(await r.text(),/secret=1234/);
});
test('request ID reutilizado se comunica como conflicto',async()=>{
  const r=await procesarAlta(alta(),deps({persistencia:{crearEmpresaConPropietario:async()=>{throw Error('request_id_conflictivo')}}}));
  assert.equal(r.status,409);
});
test('fallo del proveedor de sesiones no permite alta',async()=>{
  assert.equal((await procesarAlta(alta(),deps({verificarSesion:async()=>{throw Error('auth offline')}}))).status,503);
});

test('traduce cuota persistente agotada a 429 sin exponer datos',async()=>{
 const r=await procesarAlta(alta(),deps({persistencia:{
  crearEmpresaConPropietario:async()=>{throw Error('limite_intentos')}
 }}));
 assert.equal(r.status,429);
 assert.equal((await r.json()).error,'demasiadas_solicitudes');
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('errores acotados de la RPC se traducen a 400 y 409',async()=>{
 for(const [cause,status] of [['solicitud_invalida',400],['request_id_conflictivo',409]]){
  const r=await procesarAlta(alta(),deps({persistencia:{
   crearEmpresaConPropietario:async()=>{throw Error(cause)}
  }}));
  assert.equal(r.status,status);
 }
});
