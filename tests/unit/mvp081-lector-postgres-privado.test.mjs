import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validarEntornoLectorMvp081 as check}
 from '../../src/server/lector-pg-config-mvp081.ts';

const ficticia='postgresql://cotironda_piloto_reader_login:clave-sintetica-de-ensayo-12345@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require';
const env=()=>({
 habilitado:'true',conexion:ficticia,modo:'development',vercelEntorno:'preview',
 identificadorProyecto:'ilggkalaafhtiysyzlmg'
});
test('MVP081: solo conexion privada autorizada en entorno de desarrollo',()=>{
 assert.equal(check(env()),ficticia);
 assert.equal(check({...env(),conexion:ficticia.replace('cotironda_piloto_reader_login','cotironda_piloto_reader_login.ilggkalaafhtiysyzlmg')}),env().conexion.replace('cotironda_piloto_reader_login','cotironda_piloto_reader_login.ilggkalaafhtiysyzlmg'));
});
test('MVP081: salida cerrada por defecto, en produccion y para URL maliciosa',()=>{
 for(const bad of [
  {...env(),habilitado:undefined},
  {...env(),habilitado:'false'},
  {...env(),modo:'production'},
  {...env(),vercelEntorno:'production'},
  {...env(),identificadorProyecto:'proyecto_equivocado'},
  {...env(),conexion:undefined},
  {...env(),conexion:ficticia.replace('cotironda_piloto_reader_login','postgres')},
  {...env(),conexion:ficticia.replace('cotironda_piloto_reader_login','service_role')},
  {...env(),conexion:ficticia.replace('aws-0-sa-east-1.pooler.supabase.com','otro.host.com')},
  {...env(),conexion:ficticia.replace('sslmode=require','sslmode=disable')},
  {...env(),conexion:ficticia.replace('postgresql:','http:')},
  {...env(),conexion:ficticia.replace('clave-sintetica-de-ensayo-12345','abc')},
  {...env(),conexion:'not-a-url'},
  {...env(),telefono:'5492211111111'},
 ]){
  assert.throws(()=>check(bad),/mvp081_lector_privado_no_configurado/,
   JSON.stringify(bad).slice(0,60));
 }
});
test('MVP081: lector nunca ofrece una ruta publica, URL en JS cliente o envio WhatsApp',()=>{
 const reader=readFileSync(new URL('../../apps/portal/server/lector-postgres-mvp081.ts',import.meta.url),'utf8');
 assert.match(reader,/set transaction read only/);
 assert.match(reader,/ssl:'require'/);
 assert.match(reader,/SQL_FUENTE_PRIVADA_MVP080/);
 assert.match(reader,/COTIRONDA_PILOT_READER_ENABLED/);
 assert.match(reader,/connection.end/);
 assert.doesNotMatch(reader,/NEXT_PUBLIC_|fetch\s*\(|\bwhapi\b|sendMessage\(/i);
});
test('MVP081: rol no-login y GRANT por columna; RLS sólo de consulta',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp081_reader_role_no_login.sql',import.meta.url),'utf8');
 assert.match(sql,/create role cotironda_piloto_reader nologin noinherit/);
 assert.match(sql,/grant select\(request_id,supplier_key,revision_no,source_message_hmac,original_quote\)/);
 assert.match(sql,/grant select\(message_hmac,participant_key,request_id,processing_state,plaintext_sha256\)/);
 assert.match(sql,/create policy mvp081_reader_requests/);
 assert.match(sql,/create policy mvp081_reader_offers/);
 assert.match(sql,/create policy mvp081_reader_inbox/);
 assert.doesNotMatch(sql,/grant\s+(?:all|insert|update|delete)\b/i);
 assert.doesNotMatch(sql,/password\s*'/i);
 assert.doesNotMatch(sql,/to\s+(?:anon|authenticated|service_role)\b/i);
});
