import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enlaceWhatsappD023}
 from '../../src/server/v2-d023-contacto-verificado.ts';
const src=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('D023: WhatsApp comercial válido se abre con mensaje preparado',()=>{
 const link=enlaceWhatsappD023({state:'authorized_contact_d023',digits:'5492215551234'});
 assert.ok(link?.startsWith('https://wa.me/5492215551234?text='));
 assert.ok(decodeURIComponent(link).includes('vi su presupuesto en Cotironda'));
 assert.equal(enlaceWhatsappD023({state:'unavailable',digits:'5492215551234'}),null);
});
test('D023: no permitir URLs arbitrarias, inyección de texto ni números falsos',()=>{
 for(const digits of ['0','00112233','+5492215551234','54922155@evil','javascript:alert(1)','1234567','123456789012345678','54\\n2215551234'])
  assert.equal(enlaceWhatsappD023({state:'authorized_contact_d023',digits}),null);
 assert.equal(enlaceWhatsappD023(null),null);
});
test('D023: fuente privada exige documento autorizado y revocación',()=>{
 const sql=src('supabase/piloto/v2_d023_supplier_contact_attestation_CANDIDATE.sql');
 const edge=src('supabase/functions/cotironda-piloto-v2-supplier-contact-d023/index.ts');
 const api=src('apps/portal/lib/piloto-v2-d016-http.ts');
 assert.match(sql,/cotironda_piloto_v2_d016_original_source_private/u);
 assert.match(sql,/source_kind='owner_statement_in_chat'/u);
 assert.match(sql,/cc\.revoked_at IS NULL/u);
 assert.match(sql,/a\.revoked_at IS NULL/u);
 assert.match(sql,/c\.authenticated_message_hmac IS NOT NULL/u);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+cotironda_piloto_privado\.contact_reveal_consents_mvp109/u);
 assert.match(sql,/Corralón Ailín/u);
 assert.match(sql,/Corralón Nahuel/u);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.contact_reveal_consents_mvp109/u);
 assert.match(edge,/COTIRONDA_PILOT_AES_HEX/u);
 assert.match(edge,/crypto\.subtle\.decrypt/u);
 assert.match(edge,/contactSha256/u);
 assert.match(edge,/cotironda-contact-v1/u);
 assert.match(edge,/authorization/u);
 assert.match(edge,/again=await db\.rpc/u);
 assert.doesNotMatch(edge,/Access-Control-Allow-Origin/u);
 assert.match(api,/recuperarContactoVerificadoD023/u);
 assert.match(api,/fresh\.data\?\.state==='authorized_contact_envelope_d023'/u);
});
