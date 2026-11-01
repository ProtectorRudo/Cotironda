import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp072_runtime_aislado.sql', import.meta.url),'utf8');
const fixture=readFileSync(new URL('../../src/domain/catalogo-fixture-corralones-mvp070.ts', import.meta.url),'utf8');
test('MVP072 SQL: la fuente fixture tiene 51 materiales y el seed los preserva literalmente',()=>{
 const f=[...fixture.split('Object.freeze([')[1].split('] as const)')[0].matchAll(/^\s*'([^']+)',?\s*$/gm)].map(m=>m[1]);
 assert.equal(f.length,51);
 const start=sql.indexOf('with materials(');
 const end=sql.indexOf('insert into cotironda_piloto_privado.catalogue_lines',start);
 assert.ok(start>0&&end>start);
 const snippet=sql.slice(start,end);
 const matches=[...snippet.matchAll(/^\s*\((\d+), '([^']+)', (?:null|'[a-z_]+')\),?\s*$/gm)];
 assert.equal(matches.length,51);
 assert.deepEqual(matches.map(x=>x[2]),f);
 assert.deepEqual(matches.map(x=>Number(x[1])),f.map((_,i)=>i+1));
 assert.match(sql,/cross join \(values \('corralon_ailin'\),\('corralon_nahuel'\)\)/);
});
test('MVP072 SQL: familia conservadora: desconocidos permanecen pendientes',()=>{
 const m=[...sql.matchAll(/^\s*\(\d+, '[^']+', (null|'[a-z_]+')\),?\s*$/gm)];
 assert.equal(m.length,51);
 assert.equal(m.filter(x=>x[1]==='null').length,10);
 assert.equal(m.filter(x=>x[1]!=='null').length,41);
 assert.match(sql,/pending_review/);
});
test('MVP072 SQL: privado, RLS, sin acceso ni envío por defecto',()=>{
 assert.match(sql,/create schema cotironda_piloto_privado/);
 for(const table of ['participants','catalogue_lines','requests','request_lines','invitations','offer_versions','integration_flags'])
  assert.ok(sql.includes('alter table cotironda_piloto_privado.'+table+' enable row level security'),table);
 assert.match(sql,/revoke all on all tables in schema cotironda_piloto_privado\s+from public,anon,authenticated,service_role/);
 assert.match(sql,/whatsapp_outbound_enabled boolean not null default false check\(whatsapp_outbound_enabled=false\)/);
 assert.match(sql,/whatsapp_inbound_enabled boolean not null default false check\(whatsapp_inbound_enabled=false\)/);
 assert.doesNotMatch(sql,/\b(?:221\d{7}|\+549221\d{7})\b/);
});
test('MVP072 SQL: preserva originales, idempotencia y matching sin enviar',()=>{
 assert.match(sql,/source_message_hmac text not null/);
 assert.match(sql,/unique\(supplier_key,source_message_hmac\)/);
 assert.match(sql,/create trigger protect_original_quote/);
 assert.match(sql,/before update or delete on cotironda_piloto_privado.offer_versions/);
 assert.match(sql,/create view cotironda_piloto_privado.candidate_suppliers/);
 assert.match(sql,/with \(security_invoker=true,security_barrier=true\)/);
 assert.match(sql,/false as whatsapp_sent/);
 assert.match(sql,/lower\(btrim\(r.delivery_city\)\)=lower\(btrim\(p.delivery_city\)\)/);
});
