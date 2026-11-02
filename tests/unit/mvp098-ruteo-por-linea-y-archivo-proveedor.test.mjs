import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp098_document_line_coverage_and_supplier_media.sql',import.meta.url),'utf8');

test('MVP098: cada documento leído crea plan privado; jamás invita proveedores',()=>{
 assert.match(src,/cotironda_piloto_plan_document_mvp098/);
 assert.match(src,/proposal\.kind==='buyer_request'/);
 assert.match(src,/saved\.data!==true/);
 assert.match(src,/cotironda_piloto_record_supplier_media_mvp098/);
 const segment=src.slice(src.indexOf("if(proposal.kind==='buyer_request')"),
 src.indexOf("if(proposal.delivery_city===null",src.indexOf("if(proposal.kind==='buyer_request')")));
 assert.doesNotMatch(segment,/dispatchTwo\(|\/messages\/document|invitations/);
});
test('MVP098: nunca inventar unidad ni variante de arena',()=>{
 assert.match(sql,/rawunit is null or length\(btrim\(rawunit\)\)=0 then 'missing_unit'/);
 assert.doesNotMatch(sql,/when lower\(btrim\(literal\)\) ~ '\^arena\$' then 'arena_fina'/);
 assert.match(sql,/when f is null then 'unsupported_family'/);
 assert.match(sql,/huecos\?\[/);
 assert.match(sql,/source_verified',false/);
});
test('MVP098: permite ofertas parciales por artículo, con catálogo sin confirmar visible',()=>{
 assert.match(sql,/l\.classified_family/);
 assert.match(sql,/c\.recognition_state='curated_family'/);
 assert.match(sql,/catalogue_confirmed_at is not null/);
 assert.match(sql,/p\.opted_out_at is null/);
 assert.match(sql,/p\.consent_at is not null/);
 assert.match(sql,/lower\(btrim\(p\.delivery_city\)\)/);
});
test('MVP098: recibo de archivo proveedor es separado de versión de cotización validada',()=>{
 assert.match(sql,/supplier_media_quotes_mvp098/);
 assert.match(sql,/awaiting_fidelity_check/);
 assert.match(sql,/a\.content_sha256/);
 assert.match(sql,/a\.proposal->>'total_declared'/);
 assert.doesNotMatch(sql,/insert into cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(sql,/update cotironda_piloto_privado\.offer_versions/i);
});
test('MVP098: lectura de planes y ofertas jamás es pública y sin contacto arbitrario',()=>{
 assert.match(sql,/document_lines_mvp098 enable row level security/);
 assert.match(sql,/supplier_media_quotes_mvp098 enable row level security/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_plan_document_mvp098\(text\)\s+to service_role/);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_record_supplier_media_mvp098\(text\)\s+to service_role/);
 assert.doesNotMatch(sql,/http_post|whapi\.cloud|pg_net|token|password/iu);
});
