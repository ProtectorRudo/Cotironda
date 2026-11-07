import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildCumulativeSql,summary,pilotaudit} from '../../scripts/piloto/mvp283-cumulative-builder.mjs';
import {migrationFiles} from '../../scripts/piloto/mvp281-manifiesto-integracion.mjs';

test('las 21 migraciones se aplican por orden en UN esquema transaccional',()=>{
 const sql=buildCumulativeSql();
 let cursor=0;
 for(const name of migrationFiles){
  const marker='\\ir ../../piloto/'+name;
  const index=sql.indexOf(marker,cursor);
  assert.ok(index>cursor,name+' fuera de orden');
  assert.equal(sql.indexOf(marker,index+marker.length),-1,'archivo duplicado '+name);
  cursor=index+marker.length;
 }
 assert.equal(migrationFiles.length,21);
 assert.ok(sql.trimStart().startsWith('BEGIN;'));
 assert.match(sql,/ROLLBACK;\nSELECT \(to_regnamespace/u);
 assert.doesNotMatch(sql,/^\s*COMMIT;/m);
});
test('el bootstrap no puede cambiar sin que el test falle cerrado',()=>{
 assert.throws(()=>buildCumulativeSql(()=> 'BEGIN;\nSELECT 1;'),
 /MVP283_BOOTSTRAP_CHANGED/);
});
test('no se anuncia copia fiel ni autorización de publicación',()=>{
 const s=summary();
 assert.equal(s.real_pilot_schema_dump_used,false);
 assert.equal(s.real_pilot_touched,false);
 assert.equal(s.coinstallation_test_passed,false);
 assert.equal(s.deploy_authorized,false);
 assert.ok(s.bytes>4000);
 assert.equal(pilotaudit.private_rls_tables,pilotaudit.tables);
});


test('huella de esquema de solo lectura sin filas ni cuerpos de funciones',()=>{
 const sql=readFileSync(new URL('../../scripts/piloto/mvp283-catalog-fingerprint-readonly.sql',import.meta.url),'utf8');
 assert.match(sql,/pg_get_constraintdef/);
 assert.match(sql,/sha256/);
 assert.doesNotMatch(sql,/pg_get_functiondef/);
 assert.doesNotMatch(sql,/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|CALL|GRANT|REVOKE)\b/im);
 assert.doesNotMatch(sql,/\b(?:COPY|pg_read_file|pg_ls_dir)\b/i);
});
