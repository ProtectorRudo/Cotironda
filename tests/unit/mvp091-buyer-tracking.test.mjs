import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=(name)=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const sql=file('supabase/piloto/mvp091_buyer_tracking_pdf_guard.sql');
const gate=file('supabase/piloto/mvp091_next_round_limited_dispatch.sql');
const rollback=file('supabase/piloto/mvp091_smoke_rollback.sql');
const view=file('supabase/functions/cotironda-piloto-seguimiento/index.ts');
const whapi=file('supabase/functions/cotironda-piloto-whapi/index.ts');

test('MVP091: token nunca en SQL en claro ni en query de URL',()=>{
 assert.match(sql,/token_hash text not null unique/);
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on cotironda_piloto_privado.buyer_tracking_mvp091/);
 assert.match(sql,/r\.source_hmac=p_source_hmac/);
 assert.match(sql,/p\.chat_hmac=p_buyer_chat_hmac/);
 assert.match(sql,/r\.created_at>clock_timestamp\(\)-interval '5 minutes'/);
 assert.match(view,/location\.hash\.slice\(1\)/);
 assert.match(view,/method:"POST"/);
 assert.match(view,/referrer-policy':'no-referrer'/);
 assert.match(view,/cache-control':'no-store/);
 assert.doesNotMatch(view,/location\.search.*token|URLSearchParams|localStorage|sessionStorage/);
});
test('MVP091: el comprador ve solo número y plazo, no ofertas hasta cierre verdadero',()=>{
 assert.match(sql,/count\(distinct v\.supplier_key\)/);
 assert.match(sql,/if status<>'closed' or now_<cutoff then/);
 assert.match(sql,/'can_open',false,'offers','\[\]'::jsonb/);
 assert.match(sql,/anonymous_offers_mvp091/);
 assert.match(sql,/latest\.last_revision=a\.revision_no/);
 assert.doesNotMatch(sql,/jsonb_agg\(.*original_quote/);
 assert.match(view,/d\.state==="waiting"/);
 assert.match(view,/d\.can_open&&Array\.isArray\(d\.offers\)/);
 assert.match(view,/textContent=offer\.text/);
 assert.doesNotMatch(view,/innerHTML\s*=/);
});
test('MVP091: el archivo enviado por Whapi es PDF privado y la fuente está validada',()=>{
 assert.match(whapi,/generarSolicitudPdfMvp091/);
 assert.match(whapi,/cotironda_piloto_pdf_snapshot_mvp091/);
 assert.match(whapi,/https:\/\/gate\.whapi\.cloud\/messages\/document/);
 assert.match(whapi,/data:application\/pdf;name=/);
 assert.match(whapi,/mime_type:'application\/pdf'/);
 assert.match(whapi,/cotironda_piloto_issue_tracking_mvp091/);
 assert.match(whapi,/crearEnlacePrivadoSeguimientoMvp212\(token\)/);
 assert.doesNotMatch(whapi,/\.supabase\.co\/functions\/v1\/cotironda-piloto-seguimiento#/);
 assert.match(whapi,/cotironda_piloto_finish_tracking_mvp091/);
 assert.match(sql,/o\.state='leased' and o\.lease_token=p_lease/);
});
test('MVP091: un solo pedido nuevo, dos proveedores con zona y material confirmado por familia',()=>{
 assert.match(gate,/next_round_window_mvp091/);
 assert.match(gate,/s\.key in \('corralon_ailin','corralon_nahuel'\)/);
 assert.match(gate,/r\.delivery_city='La Plata'/);
 assert.match(gate,/l\.family_code not in \('cemento_gris_obra','hidrofugo'\)/);
 assert.match(gate,/c\.recognition_state='curated_family'/);
 assert.match(gate,/rr\.created_at>=w\.starts_at and rr\.created_at<w\.expires_at\)=1/);
 assert.match(gate,/for update of o skip locked limit 1/);
 assert.match(gate,/allow_next_pilot_send_mvp091/);
 assert.doesNotMatch(gate,/update\s+cotironda_piloto_privado\.integration_flags\s+set/i);
});
test('MVP091: smoke reversible valida privacidad incluso con oferta aprobada antes de cierre',()=>{
 assert.match(rollback,/^begin;/m);
 assert.match(rollback,/^rollback;/m);
 assert.match(rollback,/mvp091_quote_appeared_before_deadline/);
 assert.match(rollback,/mvp091_approved_quote_predeadline_leaked/);
 assert.match(rollback,/mvp091_more_than_one_round_allowed/);
 assert.match(rollback,/mvp091_unleased_pdf_visible/);
 assert.match(rollback,/mvp091_invalid_token_visible/);
 assert.match(rollback,/mvp091_private_table_grants/);
});

test('MVP091: seguimiento visible muestra recibos anónimos, no posiciones económicas inventadas',()=>{
 assert.match(view,/Presupuesto anónimo /);
 assert.match(view,/Ronda abierta · presupuestos anónimos disponibles/);
 assert.match(view,/Ronda abierta · esperando cotizaciones verificadas/);
 assert.match(view,/· recibido · en revisión/);
 assert.match(view,/const showApproved=/);
 assert.match(view,/receipts\.replaceChildren\(\)/);
 assert.doesNotMatch(view,/ranking provisional|ganador provisional|mejor precio/iu);
});

test('MVP091: HTTP 2xx de PDF no basta sin sent=true de Whapi',()=>{
 assert.match(whapi,/accepted=Boolean\(response\.ok&&data/);
 assert.match(whapi,/\.sent===true/);
 assert.match(whapi,/typeof message\?\.id==='string'/);
 assert.match(whapi,/finish\(accepted\?'api_accepted':'uncertain'/);
});

test('MVP091: enlace WhatsApp exige confirmación positiva de API',()=>{
 assert.match(whapi,/const sent=response\.ok\?await response\.json\(\)\.catch\(\(\)=>null\):null/);
 assert.match(whapi,/\(sent as Record<string,unknown>\)\.sent===true/);
 assert.match(whapi,/p_token_hash:tokenHash,p_state:accepted\?'api_accepted':'uncertain'/);
});
