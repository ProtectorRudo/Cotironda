/**
 * Cotironda V2: preflight documental, NO calendario instalable.
 * Fuentes consultadas 2026-11-12; fechas posteriores a ese día.
 * La legislación distingue feriados obligatorios, feriados OPTATIVOS
 * para comercio y días NO laborables turísticos. No mezclar.
 * ATENCIÓN: 2026 está incompleto; nunca fijar approved_at ni activar SQL.
 */
export type AlcanceFeriadoV2='feriado_nacional'|
 'feriado_optativo_comercio_local'|'dia_no_laborable_turistico';
export type FuenteFeriadoV2=Readonly<{
 dia:string;
 nombre:string;
 alcance:AlcanceFeriadoV2;
 fuente:string;
 aplicacion:'obligatorio'|'requiere_decision';
}>;
export const FERIADOS_REVISADOS_LA_PLATA_FIN_2026:
 readonly FuenteFeriadoV2[]=Object.freeze([
 {
  dia:'2026-11-19',nombre:'Aniversario de La Plata',
  alcance:'feriado_optativo_comercio_local',
  fuente:'https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224',
  aplicacion:'requiere_decision'
 },
 {
  dia:'2026-11-23',nombre:'Día de la Soberanía Nacional (trasladado)',
  alcance:'feriado_nacional',
  fuente:'https://www.bcra.gob.ar/consulta-feriados-bancarios-2026/',
  aplicacion:'obligatorio'
 },
 {
  dia:'2026-12-07',nombre:'Día no laborable con fines turísticos',
  alcance:'dia_no_laborable_turistico',
  fuente:'https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-164-2025-421799',
  aplicacion:'requiere_decision'
 },
 {
  dia:'2026-12-08',nombre:'Inmaculada Concepción de María',
  alcance:'feriado_nacional',
  fuente:'https://www.bcra.gob.ar/consulta-feriados-bancarios-2026/',
  aplicacion:'obligatorio'
 },
 {
  dia:'2026-12-25',nombre:'Navidad',
  alcance:'feriado_nacional',
  fuente:'https://www.bcra.gob.ar/consulta-feriados-bancarios-2026/',
  aplicacion:'obligatorio'
 }
]);
export type PreflightFeriadosV2=Readonly<{
 localidad:'la plata';
 anio:2026;
 cobertura:'parcial_noviembre_diciembre_2026';
 publicable:false;
 motivo:'calendario_anual_incompleto_y_optativos_pendientes';
 feriadosObligatorios:readonly string[];
 fechasOptativasPendientes:readonly string[];
}>;

/** No genera SQL ni aprueba el calendario, aunque tenga fechas oficiales.
 * Requiere una revisión anual completa y regla comercial de feriados optativos.
 */
export function preflightFeriadosLaPlata2026():PreflightFeriadosV2{
 const rows=FERIADOS_REVISADOS_LA_PLATA_FIN_2026;
 if(rows.some((x,i)=>!/^2026-\d\d-\d\d$/u.test(x.dia)||
   rows.findIndex(r=>r.dia===x.dia)!==i||
   !x.fuente.startsWith('https://')||
   x.aplicacion!==(x.alcance==='feriado_nacional'?
    'obligatorio':'requiere_decision')))
  throw Error('calendario_fuente_inconsistente');
 return Object.freeze({
  localidad:'la plata',anio:2026,
  cobertura:'parcial_noviembre_diciembre_2026',
  publicable:false,
  motivo:'calendario_anual_incompleto_y_optativos_pendientes',
  feriadosObligatorios:Object.freeze(rows.filter(x=>
   x.aplicacion==='obligatorio').map(x=>x.dia)),
  fechasOptativasPendientes:Object.freeze(rows.filter(x=>
   x.aplicacion==='requiere_decision').map(x=>x.dia))
 });
}
