import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proyectarHistorialPrivadoD017}
 from '../../src/server/v2-d017-historial-comprador.ts';
const source=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const activeId='665759f0-251b-4a2b-afb4-d763612366f7';
const oldId='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const draftId='b4e8e53e-f912-49e7-9ab3-b331f3767611';
const history={
 state:'authorized_buyer_history_v2',buyerName:'Arquitecto · prueba',
 total:3,rounds:[
  {requestId:oldId,createdAtMs:1793734203690,status:'closed',
   deliveryCity:'La Plata',requestedItems:3,canOpenOffers:false,
   availableDocuments:0},
  {requestId:activeId,createdAtMs:1794741061943,status:'prepared',
   deliveryCity:'La Plata',requestedItems:3,canOpenOffers:true,
   availableDocuments:1},
  {requestId:draftId,createdAtMs:1793701020803,status:'draft',
   deliveryCity:'La Plata',requestedItems:2,canOpenOffers:false,
   availableDocuments:0}
 ]
};
test('D017: índice del comprador mantiene orden por fecha y estados históricos',()=>{
 const v=proyectarHistorialPrivadoD017(history);
 assert.equal(v?.estado,'historial_autorizado');
 assert.equal(v?.cotizaciones.length,3);
 assert.deepEqual(v?.cotizaciones.map(x=>x.rondaId),[activeId,oldId,draftId]);
 assert.equal(v?.cotizaciones[0].originales,1);
 assert.equal(v?.cotizaciones[1].ofertasDisponibles,false);
 assert.equal(v?.cotizaciones[2].estado,'draft');
});
test('D017: no se filtra dato falso ni se aceptan origines de otra ronda',()=>{
 for(const raw of [
  null,{}, {...history,state:'untrusted'},
  {...history,total:4},
  {...history,buyerName:'contacto@ejemplo.com'},
  {...history,rounds:[history.rounds[0],history.rounds[0],history.rounds[2]]},
  {...history,rounds:[{...history.rounds[0],availableDocuments:1}]},
  {...history,rounds:[{...history.rounds[2],canOpenOffers:true}]},
  {...history,rounds:[{...history.rounds[0],deliveryCity:'<script>'}]},
  {...history,rounds:[{...history.rounds[0],requestId:'not-uuid'}]}
 ])assert.equal(proyectarHistorialPrivadoD017(raw),null);
});
test('D017: SQL revalida sesión D016 y conserva ACL y frontera comprador/empresa',()=>{
 const sql=source('supabase/piloto/v2_d017_mi_cotironda_historial_privado_CANDIDATE.sql');
 for(const fragment of [
  'd017_d016_session_context_drift',
  'cotironda_piloto_v2_d016_session_context_private',
  "WHERE target.id=p_request_id AND target.buyer_key=s.buyer_key",
  'target.created_at>=policy.activated_at',
  "s.purpose='whatsapp_buyer_session'",
  's.revoked_at IS NULL AND s.expires_at>clock_timestamp()',
  "v_ctx->>'buyerKey' IS DISTINCT FROM v_buyer",
  'WHERE r.buyer_key=v_buyer',
  "r.state IN ('prepared','closed','draft')",
  "r.state IN ('prepared','closed') AND EXISTS(",
  'cotironda_piloto_v2_d016_responders_private',
  'REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d017_buyer_history_private(text)',
  'FROM PUBLIC,anon,authenticated'
 ])assert.ok(sql.includes(fragment),fragment);
 assert.doesNotMatch(sql,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+\S+\s+TO\s+(?:PUBLIC|anon|authenticated)/iu);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.v2_d016_browser_sessions/iu);
});
test('D017: URL de acceso lleva al perfil, no exige SMS y preserva tickets',()=>{
 const entry=source('apps/portal/app/piloto/v2/acceso/acceso-whatsapp-client.tsx');
 const ticket=source('src/server/v2-d016-enlace-whatsapp.ts');
 const profile=source('apps/portal/app/piloto/v2/mi-cotironda/page.tsx');
 const historyUI=source('apps/portal/app/piloto/v2/mi-cotironda/historial-whatsapp.tsx');
 assert.match(entry,/window\.location\.replace\('\/piloto\/v2\/mi-cotironda'\)/u);
 assert.match(entry,/window\.history\.replaceState/u);
 assert.match(ticket,/\/piloto\/v2\/acceso#d016=/u);
 assert.match(profile,/puertaWhatsappPortalD016\(process\.env\)/u);
 assert.match(historyUI,/credentials:'same-origin'/u);
 assert.ok(historyUI.includes("cotizaciones/'+encodeURIComponent(r.rondaId)"));
 assert.match(historyUI,/Borradores/u);
 assert.match(historyUI,/Archivo histórico · originales no habilitados/u);
 assert.doesNotMatch(historyUI,/localStorage|sessionStorage|Bearer /u);
});
test('D017: todas las APIs continúan bajo sesión servidor y verificación por ronda',()=>{
 const adapter=source('apps/portal/lib/piloto-v2-d016-http.ts');
 const route=source('apps/portal/app/api/piloto/v2/mi-cotironda/route.ts');
 const detail=source('apps/portal/app/piloto/v2/mi-cotironda/cotizaciones/[rondaId]/detalle-historico.tsx');
 const old=source('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/page.tsx');
 assert.match(adapter,/export async function listarHistorialWhatsappD017/u);
 assert.match(adapter,/cookieSesionD016\(req\)/u);
 assert.match(adapter,/digestSesionPrivadaD016\(cookie,gate\.claveHmacHex\)/u);
 assert.match(adapter,/cotironda_piloto_v2_d017_buyer_history_private/u);
 assert.match(adapter,/proyectarHistorialPrivadoD017/u);
 assert.match(adapter,/new Response\(JSON\.stringify\(history\),\{status:200,headers:HEADERS\}\)/u);
 assert.match(route,/listarHistorialWhatsappD017/u);
 assert.match(detail,/RespuestasWhatsappD016/u);
 assert.match(detail,/ronda\.ofertasDisponibles/u);
 assert.match(detail,/cotización histórica|Cotización histórica/u);
 assert.match(old,/mis cotizaciones/i);
 assert.doesNotMatch(adapter,/signInWithOtp|createSignedUrl/u);
});
