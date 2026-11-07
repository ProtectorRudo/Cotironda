import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp104_supplier_receipt_ack.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp104_smoke_rollback.sql',import.meta.url),'utf8');

test('MVP104: buyer gets tracking for image/PDF immediately or after clarification',()=>{
 assert.match(edge,/let preparedDocumentSourceHmac:string\|null=null/);
 assert.match(edge,/preparedDocumentSourceHmac=messageHash/);
 assert.match(edge,/preparedDocumentSourceHmac=linked\.data\.source_message_hmac/g);
 assert.match(edge,/trackingSourceHmac=preparedDocumentSourceHmac\?\?/);
 assert.match(edge,/p_source_hmac:trackingSourceHmac/);
 assert.match(edge,/ready\.data\?\.state==='prepared'/);
 assert.match(edge,/cotironda_piloto_issue_tracking_mvp091/);
 assert.match(edge,/Cotironda ya tiene los datos de tu pedido/);
 assert.match(edge,/crearEnlacePrivadoSeguimientoMvp212\(token\)/);
});
test('MVP104: both text/media supplier ACK only after a stored quote',()=>{
 assert.match(edge,/supplierAckMode='text_quote'/);
 assert.match(edge,/supplierAckMode='media_quote'/);
 assert.match(edge,/receipt\.data\?\.state==='stored_unverified'/);
 assert.match(edge,/cotironda_piloto_reserve_supplier_ack_mvp104/);
 assert.match(edge,/cotironda_piloto_finish_supplier_ack_mvp104/);
 assert.match(edge,/Recibimos tu presupuesto\. Lo estamos procesando/);
 assert.match(sql,/m\.processing_state='quote_recorded'/);
 assert.match(sql,/q\.state='awaiting_fidelity_check'/);
 assert.match(sql,/a\.request_id=i\.request_id/);
 assert.match(sql,/i\.request_id=coalesce\(m\.request_id,a\.request_id\)/);
 assert.match(smoke,/'needs_review',null\);/);
});
test('MVP104: idempotent, consented, private, and cannot claim delivery',()=>{
 assert.match(sql,/supplier_ack_mvp104\s+enable row level security/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/p\.consent_at is not null and p\.opted_out_at is null/);
 assert.match(sql,/m\.received_at>clock_timestamp\(\)-interval '15 minutes'/);
 assert.match(sql,/on conflict do nothing/);
 assert.match(sql,/where message_hmac=p_message_hmac and state='leased'/);
 assert.match(sql,/to service_role/);
 assert.match(smoke,/mvp104_uncertain_quote_retried/);
 assert.match(smoke,/mvp104_document_tracking_duplicate/);
 assert.match(smoke,/mvp104_supplier_can_steal_tracking/);
 assert.match(smoke,/mvp104_unprocessed_document_acked/);
 assert.match(smoke,/mvp104_public_access/);
 assert.match(smoke,/rollback;/);
 assert.doesNotMatch(sql,/insert into cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(sql,/http_post|whapi\.cloud|pg_net/i);
});
