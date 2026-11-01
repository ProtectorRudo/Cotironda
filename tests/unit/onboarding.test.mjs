import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarEmpresa, validarSolicitudAlta, ErrorRegistro } from '../../src/domain/onboarding.ts';
const actor = { userId:'123e4567-e89b-42d3-a456-426614174000', emailVerificado:true, anonimo:false };
const entrada = { requestId:'923e4567-e89b-42d3-a456-426614174001', nombre:'  Obra  Modelo ', tipo:'supplier', nombreComercial:' Corralón Norte ' };
const puerto = () => ({ calls: [], async crearEmpresaConPropietario(data) { this.calls.push(data); return { organizationId: '123e4567-e89b-42d3-a456-426614174002', replay:false }; } });
const fails = (input, codigo) => assert.throws(() => validarSolicitudAlta(input), e => e instanceof ErrorRegistro && e.codigo === codigo);
test('registra propietario únicamente desde actor verificado y deja cotizaciones apagadas', async()=> {
  const p=puerto(); const r=await registrarEmpresa(actor,entrada,p);
  assert.equal(r.replay,false); assert.equal(p.calls.length,1);
  assert.deepEqual(p.calls[0], {idempotencyKey:entrada.requestId,userId:actor.userId,nombre:'Obra Modelo',tipo:'supplier',nombreComercial:'Corralón Norte',rolInicial:'owner',cotizacionesHabilitadas:false});
});
test('no permite registrar actor anónimo',async()=>{
  await assert.rejects(registrarEmpresa({...actor,anonimo:true},entrada,puerto()),{codigo:'usuario_no_autorizado'});
});
test('exige email verificado',async()=>{
  await assert.rejects(registrarEmpresa({...actor,emailVerificado:false},entrada,puerto()),{codigo:'usuario_no_autorizado'});
});
test('rechaza actor ausente y UUID falso',async()=>{
  await assert.rejects(registrarEmpresa(null,entrada,puerto()),{codigo:'usuario_no_autorizado'});
  await assert.rejects(registrarEmpresa({...actor,userId:'otro'},entrada,puerto()),{codigo:'usuario_no_autorizado'});
});
test('no acepta propietario, empresa ni rol inyectados en cuerpo',()=>{
  for (const campo of ['userId','organizationId','role','status','aceptaSolicitudes','precio']) {
    fails({...entrada,[campo]:'admin'},'campo_no_permitido');
  }
});
test('rechaza UUID idempotente malformado',()=> fails({...entrada,requestId:'registro-1'},'request_id_invalido'));
test('rechaza objeto inválido',()=>fails(null,'solicitud_invalida'));
test('rechaza nombres vacíos y con caracteres de control',()=>{
  fails({...entrada,nombre:' '},'nombre_invalido');
  fails({...entrada,nombre:'A\nB'},'nombre_invalido');
});
test('rechaza nombres demasiado largos',()=>fails({...entrada,nombre:'a'.repeat(161)},'nombre_invalido'));
test('rechaza tipo de empresa desconocido',()=>fails({...entrada,tipo:'admin'},'tipo_invalido'));
test('proveedor exige nombre comercial',()=>fails({...entrada,nombreComercial:''},'nombre_comercial_invalido'));
test('comprador no puede proporcionar nombre comercial',()=>fails({...entrada,tipo:'buyer'},'nombre_comercial_no_aplica'));
test('comprador sin nombre comercial es válido',()=>{
  const {nombreComercial,...sin}=entrada;
  assert.deepEqual(validarSolicitudAlta({...sin,tipo:'buyer'}).nombreComercial,null);
});
test('solicitud tipo both conserva proveedor deshabilitado',async()=>{
  const p=puerto(); await registrarEmpresa(actor,{...entrada,tipo:'both'},p);
  assert.equal(p.calls[0].tipo,'both'); assert.equal(p.calls[0].cotizacionesHabilitadas,false);
});
test('fallo de persistencia se propaga, no informa éxito',async()=>{
  const p={crearEmpresaConPropietario:async()=>{throw new Error('db no disponible')}};
  await assert.rejects(registrarEmpresa(actor,entrada,p),/db no disponible/);
});
test('puerto recibe misma clave idempotente para reintento',async()=>{
  const p=puerto(); await registrarEmpresa(actor,entrada,p); await registrarEmpresa(actor,entrada,p);
  assert.equal(p.calls.length,2);
  assert.equal(p.calls[0].idempotencyKey,p.calls[1].idempotencyKey);
});
