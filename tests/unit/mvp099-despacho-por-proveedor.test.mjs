import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp099_document_partial_invites.sql',import.meta.url),'utf8');
const promote=readFileSync(new URL('../../supabase/piloto/mvp099b_dual_agreement_and_promotion.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const ai=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts',import.meta.url),'utf8');

test('MVP099: todos los ítems siguen en la solicitud; salida por proveedor se filtra a invitación',()=>{
 assert.match(sql,/create table cotironda_piloto_privado\.invitation_lines_mvp099/);
 assert.match(sql,/foreign key\(request_id,line_no\)/);
 assert.match(sql,/c\.family_code=l\.family_code/);
 assert.match(sql,/and il\.supplier_key=p_supplier/);
 assert.match(sql,/and il\.line_no=l\.line_no/);
 assert.match(sql,/where l\.request_id=r\.id and \(/);
 assert.match(sql,/update cotironda_piloto_privado\.whapi_outbox o\s+set message_body=body_text/);
 assert.match(sql,/z_mvp099_partial_invite/);
});
test('MVP099: una fuente original, dos lecturas y sin consentimiento no habilitan envíos',()=>{
 assert.match(promote,/document_agreements_mvp099/);
 assert.match(promote,/p_second_proposal/);
 assert.match(promote,/line_disagreement/);
 assert.match(promote,/unit_evidence_missing/);
 assert.match(promote,/city_disagreement/);
 assert.match(promote,/delivery_note_disagreement/);
 assert.match(promote,/source_sha256/);
 assert.match(promote,/needs_material_specification/);
 assert.match(promote,/uncovered_items/);
 assert.match(promote,/p\.opted_out_at is null/);
 assert.match(sql,/a\.content_sha256=ds\.content_sha256/);
 assert.match(sql,/s\.opted_out_at is null/);
 assert.match(sql,/b\.opted_out_at is null/);
});
test('MVP099: Whapi hace segunda extracción separada, sin exponer propuestas ni autorizar por sí mismo',()=>{
 assert.match(ai,/perspective\?:'primary'\|'corroboration'/);
 assert.match(edge,/Promise\.allSettled/);
 assert.match(edge,/proposeDocumentAI\(\{\.\.\.args,perspective:'primary'\}\)/);
 assert.match(edge,/proposeDocumentAI\(\{\.\.\.args,perspective:'corroboration'\}\)/);
 assert.match(edge,/cotironda_piloto_record_agreement_mvp099/);
 assert.match(edge,/agreed\.data\?\.state==='agreed_private'/);
 assert.match(edge,/cotironda_piloto_prepare_document_mvp099/);
 assert.match(edge,/source_message_hmac/);
 assert.match(edge,/await dispatchTwo\(sec,db\)/);
});
test('MVP099: la cola sigue sin reintentos ciegos y envía solo al contacto autorizado',()=>{
 assert.match(sql,/allow_next_pilot_send_mvp091/);
 assert.match(sql,/allow_document_send_mvp099/);
 assert.match(sql,/o\.state='leased' and o\.lease_token=p_lease/);
 assert.match(edge,/cotironda_piloto_authorize_whapi_v1/);
 assert.match(edge,/cotironda_piloto_pdf_snapshot_mvp091/);
 assert.match(edge,/if\(!equalSecret\(c\.chat_hmac,expected\)\)/);
});
test('MVP099: privacidad de subconjuntos y fuente, sin permisos cliente',()=>{
 assert.match(sql,/invitation_lines_mvp099 enable row level security/);
 assert.match(sql,/document_sources_mvp099 enable row level security/);
 assert.match(promote,/document_agreements_mvp099 enable row level security/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(promote,/from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/grant select.*to authenticated/iu);
 assert.doesNotMatch(promote,/whapi\.cloud|http_post|pg_net/iu);
});
