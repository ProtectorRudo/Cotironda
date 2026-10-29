import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autorizarIntentoDeRegistro } from '../../src/server/limite-intentos.ts';
import { procesarAlta } from '../../src/server/registro-http.ts';

const origin='https://cotironda-dev.example';
test('la guardia de intentos nunca devuelve true sin implementación persistente',async()=>{
 await assert.rejects(autorizarIntentoDeRegistro('123e4567-e89b-42d3-a456-426614174000'),
   /limite_de_intentos_no_configurado/);
});
test('la ruta real usa la guardia cerrada, sin atajos que devuelven true',()=>{
 const source=readFileSync(new URL('../../apps/portal/app/api/organizaciones/route.ts', import.meta.url),'utf8');
 assert.match(source,/autorizarIntento:autorizarIntentoDeRegistro/);
 assert.doesNotMatch(source,/autorizarIntento\s*:\s*async\s*\([^)]*\)\s*=>\s*true/);
});
test('incluso con login válido, un limitador no disponible impide persistencia',async()=>{
 let llamadasBD=0;
 const req=new Request(origin+'/api/organizaciones',{method:'POST',headers:{
   'content-type':'application/json',origin
 },body:JSON.stringify({requestId:'923e4567-e89b-42d3-a456-426614174001',nombre:'Obra Sur',tipo:'buyer'})});
 const res=await procesarAlta(req,{
   configurado:true,originPermitido:origin,
   verificarSesion:async()=>({userId:'123e4567-e89b-42d3-a456-426614174000',emailVerificado:true,anonimo:false}),
   autorizarIntento:autorizarIntentoDeRegistro,
   persistencia:{crearEmpresaConPropietario:async()=>{llamadasBD++;return {organizationId:'no-debe-ocurrir',replay:false};}}
 });
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'limite_no_disponible');
 assert.equal(llamadasBD,0);
});
