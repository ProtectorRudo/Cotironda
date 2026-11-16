import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(
 new URL('../../supabase/piloto/v2_d013_catalogue_locality_alias_CANDIDATE.sql',
 import.meta.url),'utf8');

test('D013: la equivalencia ciudad/provincia se aplica en las dos consultas del catálogo',()=>{
 assert.equal((sql.match(/lower\(btrim\(p\.delivery_city\)\)=CASE/gu)??[]).length,2);
 for(const alias of [
  "'la plata, buenos aires'",
  "'la plata, buenos aires, argentina'",
  "'la plata, provincia de buenos aires'",
  "'la plata, provincia de buenos aires, argentina'"
 ])assert.ok(sql.includes(alias),alias);
 assert.ok(sql.includes("THEN 'la plata'"));
 assert.ok(sql.includes('ELSE lower(btrim(p_delivery_city))'));
 assert.ok(sql.includes('p.opted_out_at IS NULL'));
 assert.ok(sql.includes('p.consent_at IS NOT NULL'));
 assert.ok(sql.includes('proveedor_contactable_mvp307'));
 assert.ok(sql.includes('catalogoConfirmado'));
});

test('D013: sin emparejamiento por subcadenas ni cambio de permisos o fuentes',()=>{
 assert.doesNotMatch(sql,/ILIKE|regexp_replace|split_part|LIKE\s*'%|GRANT\s+EXECUTE/iu);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.participants/iu);
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+cotironda_piloto_privado\.requests/iu);
 assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_catalogo_mvp220'));
});
