import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ingresoCompradorV2Habilitado,respuestasV2Habilitadas,
 responderCotizacionesV2}
 from '../../src/server/v2-03-respuestas-http.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const sha='e'.repeat(40);
const env=()=>({
 COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED:'true',
 COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_SHA:sha,
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:sha,
 NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL:PILOT,
 NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:
  'sb_publishable_'+'a'.repeat(30),
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:PILOT,
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'',
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY:''
});
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');

test('V2-19: login SMS puede habilitarse sin servicio privado, ningún secreto',()=>{
 const c=env();
 assert.equal(ingresoCompradorV2Habilitado(c),true);
 assert.equal(respuestasV2Habilitadas(c),false);
 assert.equal(c.COTIRONDA_PILOT_SUPABASE_SECRET_KEY,'');
});

test('V2-19: no se abre login fuera de Preview, SHA validado o sin clave pública',()=>{
 for(const patch of [
  {COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED:'false'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {VERCEL_ENV:'production'},
  {VERCEL_ENV:'development'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_REGISTRATION_ENABLED:undefined},
  {VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)},
  {VERCEL_GIT_COMMIT_SHA:undefined},
  {COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'incorrect'},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL:'https://otro.supabase.co'},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'eyJlegacy'},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:''}
 ]){
  assert.equal(ingresoCompradorV2Habilitado({...env(),...patch}),false,
   JSON.stringify(patch));
 }
 assert.equal(ingresoCompradorV2Habilitado({}),false);
});

test('V2-19: servicio cotizaciones sigue denegado sin flag y secretos',async()=>{
 let operations=0;
 const ports={
  getUser:async()=>{operations++;return null},
  consultarPrivado:async()=>{operations++;return null}
 };
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const r=await responderCotizacionesV2(
  new Request('https://cotironda.example/api/piloto/v2/rondas/'+id+'/respuestas',{
   headers:{Authorization:'Bearer test.token.invalid'}
  }),id,ports,env()
 );
 assert.equal(r.status,503);
 assert.equal(operations,0);
 assert.equal(r.headers.get('cache-control')?.includes('no-store'),true);
});

test('V2-19: la página requiere puerta SMS distinta a la puerta comercial',()=>{
 const page=source('apps/portal/app/piloto/v2/rondas/[rondaId]/page.tsx');
 assert.match(page,/ingresoCompradorV2Habilitado\(process\.env\)/u);
 assert.match(page,/respuestasV2Habilitadas\(process\.env\)/u);
 assert.match(page,/puedeConsultarRespuestas=\{/u);
 assert.match(page,/if\(!UUID\.test\(rondaId\)\|\|!ingresoCompradorV2Habilitado/u);
 assert.doesNotMatch(page,/auth\.admin\.|service_role|NEXT_PUBLIC_COTIRONDA_PILOT_AES_HEX/u);
 assert.match(page,/notFound\(\)/u);
 assert.match(page,/export const dynamic='force-dynamic'/u);
});

test('V2-19: UI verificada no consulta, descarga, analiza ni hace polling con OFF',()=>{
 const ui=source('apps/portal/app/piloto/v2/rondas/[rondaId]/respuestas-comprador.tsx');
 assert.match(ui,/if\(!puedeConsultarRespuestas\)return;/u);
 assert.match(ui,/authenticated&&puedeConsultarRespuestas\)void refresh\(\)/u);
 assert.match(ui,/!authenticated\|\|!client\|\|!puedeConsultarRespuestas/u);
 assert.match(ui,/!authenticated\|\|!puedeConsultarRespuestas\|\|/u);
 assert.match(ui,/if\(busy\|\|!puedeConsultarRespuestas\)return;/u);
 assert.match(ui,/puedeConsultarRespuestas&&catalog\?\.respuestas\.map/u);
 assert.match(ui,/puedeConsultarRespuestas&&\s*<button/u);
 assert.match(ui,/Todavía no recibimos cotizaciones|todavía está deshabilitada/u);
 assert.match(ui,/client\.auth\.verifyOtp\(/u);
 assert.match(ui,/shouldCreateUser:false/u);
 assert.doesNotMatch(ui,/phone_confirm:true|signUp\(/u);
});
