import test from 'node:test';
import assert from 'node:assert/strict';
import { rechazarIntentosSinLimitador } from '../../src/server/limite-intentos.ts';
import { procesarAlta } from '../../src/server/registro-http.ts';

test('no permite ninguna alta mientras falta un limitador compartido',async()=>{
 await assert.rejects(rechazarIntentosSinLimitador('123e4567-e89b-42d3-a456-426614174000'),/limitador_no_configurado/);
});
test('sin limitador, responde 503 antes de cualquier escritura',async()=>{
 let writes=0;
 const origin='https://cotironda.ejemplo.com.ar';
 const req=new Request(origin+'/api/organizaciones',{
  method:'POST', headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({requestId:'923e4567-e89b-42d3-a456-426614174001',nombre:'Empresa prueba',tipo:'buyer'})
 });
 const res=await procesarAlta(req,{
  configurado:true,originPermitido:origin,
  verificarSesion:async()=>({userId:'123e4567-e89b-42d3-a456-426614174000',emailVerificado:true,anonimo:false}),
  autorizarIntento:rechazarIntentosSinLimitador,
  persistencia:{async crearEmpresaConPropietario(){writes++;return {organizationId:'123e4567-e89b-42d3-a456-426614174002',replay:false};}}
 });
 assert.equal(res.status,503);
 assert.deepEqual(await res.json(),{error:'limite_no_disponible'});
 assert.equal(writes,0);
});
