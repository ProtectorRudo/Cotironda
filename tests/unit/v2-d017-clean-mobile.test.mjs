import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const css=read('apps/portal/app/styles.css');
const home=read('apps/portal/app/piloto/v2/mi-cotironda/page.tsx');
const history=read('apps/portal/app/piloto/v2/mi-cotironda/historial-whatsapp.tsx');
const detail=read('apps/portal/app/piloto/v2/mi-cotironda/cotizaciones/[rondaId]/detalle-historico.tsx');
const bids=read('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');
const direct=read('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/page.tsx');

test('Cotironda Clean: identidad azul sólo dentro del portal privado',()=>{
 assert.match(css,/COTIRONDA CLEAN BLUE V2/u);
 assert.match(css,/body:has\(\.coti-clean\)\.?.*\{/u);
 assert.match(css,/#0866ff/iu);
 assert.match(css,/@media\(max-width:560px\)/u);
 assert.match(home,/coti-profile-shell coti-clean/u);
 assert.match(detail,/coti-clean-detail-heading/u);
 assert.match(direct,/coti-buyer-portal coti-clean/u);
 assert.match(home,/puertaWhatsappPortalD016\(process\.env\)/u);
 assert.match(direct,/puertaWhatsappPortalD016\(process\.env\)/u);
});
test('Historial: cotizaciones reales primero, borradores colapsables y sin tarjetas grandes',()=>{
 assert.match(history,/coti-clean-history/u);
 assert.match(history,/active=sent\.filter/u);
 assert.match(history,/history=sent\.filter/u);
 assert.match(history,/coti-clean-drafts/u);
 assert.match(history,/Borradores/u);
 assert.doesNotMatch(history,/coti-profile-stats/u);
 assert.doesNotMatch(history,/coti-profile-welcome/u);
 assert.match(history,/credentials:'same-origin'/u);
 assert.match(history,/Recibir un nuevo enlace por WhatsApp/u);
 assert.match(history,/Archivo histórico · originales no habilitados/u);
 assert.doesNotMatch(history,/localStorage|sessionStorage|Bearer /u);
});
test('Propuestas: precio y estado visibles, condiciones y evidencia sólo a pedido',()=>{
 assert.match(bids,/coti-clean-bid-price/u);
 assert.match(bids,/coti-clean-coverage/u);
 assert.match(bids,/aria-expanded=\{expanded\}/u);
 assert.match(bids,/\{expanded&&<div className="coti-clean-bid-expanded"/u);
 assert.match(bids,/Ver detalle/u);
 assert.match(bids,/PDF original/u);
 assert.match(bids,/Ver análisis completo/u);
 assert.doesNotMatch(bids,/\['Entrega',q\.resumen\.condiciones\.entrega\]/u);
 assert.match(bids,/cover\.identificados/u);
 assert.match(bids,/cover\.porVerificar/u);
 assert.match(bids,/informe&&<details/u);
});
test('No cambian acciones, autorización de descargas ni regeneración IA',()=>{
 assert.match(bids,/credentials:'same-origin'/u);
 assert.match(bids,/originales-whatsapp/u);
 assert.match(bids,/nombreDescargaOriginalV2/u);
 assert.match(bids,/if\(!res\.ok\)throw Error\('unavailable'\)/u);
 assert.match(bids,/historialAnalisis\.current\.clear\(\)/u);
 assert.match(bids,/seleccionarAnalisisPendientesV2/u);
 assert.match(bids,/informe-final-whatsapp/u);
 assert.doesNotMatch(bids,/sms|signInWithOtp|createSignedUrl/u);
});
