import test from 'node:test';
import assert from 'node:assert/strict';
import {FERIADOS_REVISADOS_LA_PLATA_FIN_2026 as rows,
 preflightFeriadosLaPlata2026 as preflight}
 from '../../src/domain/ia-central/calendario-operativo-preflight-2026.ts';
import {readFileSync} from 'node:fs';

test('calendario: nov 19 optativo comercio, NO feriado nacional obligatorio',()=>{
 const row=rows.find(r=>r.dia==='2026-11-19');
 assert.ok(row);
 assert.equal(row.alcance,'feriado_optativo_comercio_local');
 assert.equal(row.aplicacion,'requiere_decision');
 assert.match(row.fuente,/normas\.gba\.gob\.ar/u);
});
test('calendario: 23 noviembre, 8 y 25 diciembre obligatorios',()=>{
 const p=preflight();
 assert.deepEqual(p.feriadosObligatorios,
  ['2026-11-23','2026-12-08','2026-12-25']);
 assert.deepEqual(p.fechasOptativasPendientes,
  ['2026-11-19','2026-12-07']);
});
test('calendario: año incompleto, datos no aprobables sin validación integral',()=>{
 const p=preflight();
 assert.equal(p.publicable,false);
 assert.equal(p.cobertura,'parcial_noviembre_diciembre_2026');
 assert.equal(p.motivo,'calendario_anual_incompleto_y_optativos_pendientes');
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_05_plazo_dos_dias_habiles_candidate.sql',
  import.meta.url),'utf8');
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
 assert.match(sql,/c\.approved_at IS NOT NULL/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado\.v2_business_holidays/u);
});
