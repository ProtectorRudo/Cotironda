import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validarEntornoLectorMvp081 as validar}
 from '../../src/server/lector-pg-config-mvp081.ts';

const base='postgresql://cotironda_piloto_reader_login.ilggkalaafhtiysyzlmg:secretos_de_prueba_no_reales_123456@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require';
function config(extra={}){return {
 habilitado:'true',conexion:base,modo:'production',
 vercelEntorno:'preview',identificadorProyecto:'ilggkalaafhtiysyzlmg',
 ...extra
}}
test('MVP082: Preview Next.js NODE_ENV=production permitido sólo con VERCEL_ENV=preview y flag',()=>{
 assert.equal(validar(config()),base);
 const local=config({modo:'development',vercelEntorno:undefined});
 assert.equal(validar(local),base);
});
test('MVP082: nunca permitir producción, incluso con flag explícito',()=>{
 for(const c of [
 config({vercelEntorno:'production'}),
 config({vercelEntorno:undefined}),
 config({vercelEntorno:'development'}),
 config({habilitado:undefined}),
 config({habilitado:'false'}),
 config({identificadorProyecto:'ref_otro'}),
 config({modo:'test'})
 ])assert.throws(()=>validar(c),/mvp081_lector_privado_no_configurado/);
});
test('MVP082: identidad del usuario PG, SSL y host de DB fijados',()=>{
 for(const u of [
 base.replace('cotironda_piloto_reader_login.ilggkalaafhtiysyzlmg','postgres'),
 base.replace('cotironda_piloto_reader_login.ilggkalaafhtiysyzlmg','cotironda_piloto_reader_login.otro'),
 base.replace('aws-0-sa-east-1.pooler.supabase.com','example.org'),
 base.replace('sslmode=require','sslmode=disable'),
 base.replace('?sslmode=require',''),
 base.replace('/postgres?','/otra?'),
 base.replace('?sslmode=require','?sslmode=require&options=-c'),
 base.replace('6543','7777'),
 base.replace('secretos_de_prueba_no_reales_123456','123')
 ])assert.throws(()=>validar(config({conexion:u})),/mvp081_lector_privado_no_configurado/);
});
test('MVP082: cuenta LOGIN sin contraseña, no hereda y sólo puede SET rol NOLOGIN',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp082_login_sin_password.sql',import.meta.url),'utf8');
 assert.match(sql,/create role cotironda_piloto_reader_login/i);
 assert.match(sql,/login password null noinherit/i);
 assert.match(sql,/nobypassrls/i);
 assert.match(sql,/connection limit 2/i);
 assert.match(sql,/with admin false, inherit false, set true/i);
 assert.doesNotMatch(sql,/alter role[^;]+password\s*'/i);
 assert.doesNotMatch(sql,/grant\s+(?:select|all|insert|update|delete)\b/i);
});
test('MVP082: la consulta real activa rol dentro de la transacción y no fuga texto por console',()=>{
 const s=readFileSync(new URL('../../apps/portal/server/lector-postgres-mvp081.ts',import.meta.url),'utf8');
 assert.match(s,/set transaction read only/);
 assert.match(s,/set local role cotironda_piloto_reader/);
 assert.match(s,/select current_user as lector/);
 assert.match(s,/mvp082_lector_no_activo/);
 assert.match(s,/connection\.end/);
 assert.doesNotMatch(s,/console\.(?:log|warn|error)|NEXT_PUBLIC_|service_role/i);
});
