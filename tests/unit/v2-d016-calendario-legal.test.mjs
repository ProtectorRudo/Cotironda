import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d016_calendario_la_plata_2026_CANDIDATE.sql',import.meta.url
),'utf8');
const active=sql.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');
const events=[...active.matchAll(
 /\('la plata', DATE '(\d{4}-\d{2}-\d{2})',2026,'([^']+)','(https:\/\/[^']+)'\)/gu
 )].map(([,day,description,evidence])=>({day,description,evidence}));
const dates=new Set(events.map(x=>x.day));

test('D016 La Plata 2026: 18 fechas con fuente oficial y sin duplicados',()=>{
 assert.equal(events.length,18);
 assert.equal(dates.size,18);
 for(const event of events){
  assert.match(event.day,/^2026-\d{2}-\d{2}$/u);
  assert.ok(event.description.length>=4&&event.description.length<=200);
  assert.ok(event.evidence.length>=8&&event.evidence.length<=300);
  assert.ok(event.evidence.startsWith('https://'));
 }
});
test('D016 La Plata 2026: feriado PBA, visita papal y Soberanía trasladada',()=>{
 for(const required of [
  '2026-11-09','2026-11-11','2026-11-23','2026-12-08',
  '2026-12-25','2026-06-15','2026-04-03'
 ])assert.ok(dates.has(required),required);
 assert.match(events.find(e=>e.day==='2026-11-11').evidence,/argentina\.gob\.ar\/normativa\/nacional\/norma-430580\/texto/u);
 assert.match(events.find(e=>e.day==='2026-11-23').description,/trasladado/u);
});
test('D016 La Plata: no equipara días no laborables, feriados comerciales optativos ni otras provincias',()=>{
 for(const optional of [
  '2026-03-23','2026-07-10','2026-11-10','2026-11-19',
  '2026-11-20','2026-12-07'
 ])assert.ok(!dates.has(optional),optional);
 assert.match(sql,/feriados optativos/u);
 assert.match(sql,/comercio optativo/u);
});
test('D016 calendario candidato: aprobación NULL, guard PILOTO y 2027 no inventado',()=>{
 assert.match(active,/approved_at[\s\S]*?VALUES\([\s\S]*?'la plata',2026,'lp_v2_r1'/u);
 assert.match(active,/\bNULL\s*\)/u);
 assert.match(active,/D016_NOT_PILOT_PROJECT/u);
 assert.match(active,/D016_CALENDAR_EXISTS_REVIEW_MANUALLY/u);
 assert.match(active,/D016_CALENDAR_REVISION_ALREADY_USED/u);
 assert.match(active,/D016_LP_CANDIDATE_PREAPPROVED/u);
 assert.doesNotMatch(active,/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bALTER\b|\bDROP\b|\bGRANT\b|\bREVOKE\b/iu);
 assert.doesNotMatch(active,/\bCOMMIT\s*;/u);
 assert.doesNotMatch(active,/VALUES\(\s*'la plata',2027/u);
 assert.doesNotMatch(active,/\bcron\.schedule\b|\bnet\.http_post\b/u);
});
