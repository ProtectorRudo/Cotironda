import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {debeActualizarRespuestasV2,INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS}
 from '../../apps/portal/lib/piloto-v2-actualizacion-respuestas.ts';

const ready={autenticado:true,paginaVisible:true,ocupado:false,
 consultaEnCurso:false};
const ui=readFileSync(new URL(
 '../../apps/portal/app/piloto/v2/rondas/[rondaId]/respuestas-comprador.tsx',
 import.meta.url),'utf8');

test('V2-11: consulta automática únicamente para comprador visible y libre',()=>{
 assert.equal(debeActualizarRespuestasV2(ready),true);
 for(const cambio of [
  {autenticado:false},{paginaVisible:false},{ocupado:true},
  {consultaEnCurso:true}
 ]){
  assert.equal(debeActualizarRespuestasV2({...ready,...cambio}),false);
 }
 assert.equal(INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS,60_000);
});

test('V2-11: UI consulta GET privado cada minuto y reanuda al volver',()=>{
 assert.match(ui,/setInterval\(sincronizar,INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS\)/u);
 assert.match(ui,/addEventListener\('visibilitychange',sincronizar\)/u);
 assert.match(ui,/addEventListener\('focus',sincronizar\)/u);
 assert.match(ui,/removeEventListener\('visibilitychange',sincronizar\)/u);
 assert.match(ui,/clearInterval\(intervalo\)/u);
 assert.match(ui,/debeActualizarRespuestasV2\(/u);
 assert.match(ui,/void refresh\(true\)/u);
 assert.match(ui,/cache:'no-store',credentials:'omit'/u);
 assert.match(ui,/Authorization:'Bearer '\+access/u);
});

test('V2-11: sin timers compartidos ni llamadas públicas ni exposición de invitados',()=>{
 assert.doesNotMatch(ui,/fetch\(['"]https:\/\//u);
 assert.doesNotMatch(ui,/\/api\/whapi|enviarWhatsApp|sendMessage/u);
 assert.doesNotMatch(ui,/listaInvitados|proveedoresPendientes|pendingSuppliers/u);
 assert.match(ui,/authGeneration\.current/u);
 assert.match(ui,/setCatalog\(null\)/u);
 assert.match(ui,/auth\.onAuthStateChange/u);
});
