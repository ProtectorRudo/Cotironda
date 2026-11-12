import test from 'node:test';
import assert from 'node:assert/strict';
import {decidirVencimientoCentralV2} from '../../src/domain/ia-central/calendario-conciliado-automatico-v2.ts';

const NATIONAL_2026=[
 '2026-01-01','2026-02-16','2026-02-17','2026-03-24',
 '2026-04-02','2026-04-03','2026-05-01','2026-05-25',
 '2026-06-15','2026-06-20','2026-07-09','2026-08-17',
 '2026-10-12','2026-11-09','2026-11-23','2026-12-08',
 '2026-12-25'
];
const NATIONAL_2027=[
 '2027-01-01','2027-02-08','2027-02-09','2027-03-24',
 '2027-04-02','2027-05-01','2027-05-25','2027-06-20',
 '2027-07-09','2027-08-17','2027-12-08','2027-12-25'
]; // PURE FIXTURE — NOT an official released calendar.

const items=(year,days)=>[
 ...days.map((fecha,i)=>({fecha,nombre:'Feriado '+String(i+1),
  tipo:'inamovible'})),
 ...(year===2026?[{fecha:'2026-12-07',
  nombre:'Día no laborable con fines turísticos',tipo:'puente'}]:[])
];
const source=(anio,role)=>{
 const national=anio===2026?NATIONAL_2026:NATIONAL_2027;
 return {anio,url:role==='gobierno'?
  'https://www.datos.gob.ar/dataset/jgm-feriados-nacionales':
  'https://api.argentinadatos.com/v1/feriados/'+anio,
  cobertura:'anual_completa',feriados:items(anio,national)};
};
const local=()=>({
 cobertura:'anual_completa',
 fuente:'https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224',
 feriados:[{fecha:'2026-11-19',nombre:'Aniversario de La Plata',
  tipo:'feriado_local_optativo'}]
});
const input=(iso='2026-11-18T14:00:00Z')=>({
 fechaCreacionISO:iso,localidad:'La Plata',anio:2026,
 gobierno:source(2026,'gobierno'),contraste:source(2026,'contraste'),
 locales:local(),
 reglaOptativos:'contar_como_habiles',
 adhesionOptativosConfirmada:false
});

test('Central calendario: cuenta dos días hábiles siguientes, 18h local',()=>{
 const d=decidirVencimientoCentralV2(input());
 assert.equal(d.estado,'vencimiento_verificable');
 assert.equal(d.venceISO,'2026-11-20T21:00:00.000Z');
 assert.equal(d.venceLocal,'2026-11-20 18:00');
 assert.ok(d.diasOptativosNoExcluidos.includes('2026-11-19'));
 assert.equal(d.escrituraDB,false);
 assert.equal(d.whatsappEnviado,false);
});
test('Central calendario: viernes antes del feriado nacional del lunes',()=>{
 const d=decidirVencimientoCentralV2(input('2026-11-20T14:00:00Z'));
 assert.equal(d.venceLocal,'2026-11-25 18:00');
 assert.ok(d.feriadosExcluidos.includes('2026-11-23'));
});
test('Central calendario: turismo 7/12 no es obligatorio, 8/12 sí',()=>{
 const d=decidirVencimientoCentralV2(input('2026-12-04T12:00:00Z'));
 assert.equal(d.venceLocal,'2026-12-09 18:00');
 assert.ok(d.diasOptativosNoExcluidos.includes('2026-12-07'));
 assert.ok(d.feriadosExcluidos.includes('2026-12-08'));
});
test('Central calendario: localidad optativa solo se excluye con adhesión constatada',()=>{
 const d=decidirVencimientoCentralV2({
  ...input(),reglaOptativos:'excluir_solo_si_adheridos',
  adhesionOptativosConfirmada:true
 });
 assert.equal(d.venceLocal,'2026-11-24 18:00');
 assert.ok(d.feriadosExcluidos.includes('2026-11-19'));
});
test('Central calendario: contradicción entre fuentes no genera fecha inventada',()=>{
 const args=input('2026-11-20T14:00:00Z');
 const changes={...args.contraste,feriados:args.contraste.feriados
  .filter(f=>f.fecha!=='2026-11-23')};
 const d=decidirVencimientoCentralV2({...args,contraste:changes});
 assert.equal(d.estado,'revision_automatica');
 assert.equal(d.codigo,'discrepancia_entre_fuentes_nacionales');
 assert.equal(d.venceISO,null);
});
test('Central calendario: falta de cobertura local o dominio no confiable = revisión',()=>{
 const args=input();
 for(const patch of [
  {locales:{...args.locales,cobertura:'parcial'}},
  {gobierno:{...args.gobierno,url:'https://feriados-inventados.example'}},
  {locales:{...args.locales,fuente:'http://normas.gba.gob.ar/fake'}}
 ]){
  const d=decidirVencimientoCentralV2({...args,...patch});
  assert.equal(d.estado,'revision_automatica');
  assert.equal(d.venceISO,null);
 }
});
test('Central calendario: sin año siguiente verificado no inventa cierre en enero',()=>{
 const d=decidirVencimientoCentralV2(input('2026-12-30T12:00:00Z'));
 assert.equal(d.estado,'revision_automatica');
 assert.equal(d.codigo,'calendario_anio_siguiente_no_conciliado');
});
test('Central calendario: cruza año con fuentes verificadas y Año Nuevo',()=>{
 const base=input('2026-12-30T12:00:00Z');
 const next={gobierno:source(2027,'gobierno'),
  contraste:source(2027,'contraste'),
  locales:{...local(),feriados:[]}};
 const d=decidirVencimientoCentralV2({...base,siguienteAnio:next});
 assert.equal(d.estado,'vencimiento_verificable');
 assert.equal(d.venceLocal,'2027-01-04 18:00');
 assert.equal(d.trazabilidad.length,6);
});
test('Central calendario: feriados duplicados y fecha imposible fallan cerrado',()=>{
 const args=input();
 for(const item of [
  {fecha:'2026-11-23',nombre:'Duplicado nacional',tipo:'inamovible'},
  {fecha:'2026-02-30',nombre:'Fecha imposible',tipo:'inamovible'}
 ]){
  const d=decidirVencimientoCentralV2({
   ...args,gobierno:{...args.gobierno,feriados:[...args.gobierno.feriados,item]}
  });
  assert.equal(d.estado,'revision_automatica');
 }
});
