import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 seleccionarAnalisisPendientesV2,registrarIntentosAnalisisV2,
 INTERVALO_REINTENTO_ANALISIS_V2_MS,
 MAX_INTENTOS_ANALISIS_V2,
 MAX_ORIGINALES_ANALISIS_V2,
 MAX_ANALISIS_SIMULTANEOS_V2
} from '../../apps/portal/lib/piloto-v2-reintento-analisis.ts';

const ID='11111111-1111-4111-8111-111111111111';
const ITEM={documentoId:ID,puntos:[]};
const HORA=1_800_000_000_000;

test('V2-12: si llega una respuesta y no tiene guía, se programa su análisis',()=>{
 const map=new Map();
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA),[ID]);
 registrarIntentosAnalisisV2(map,[ID],HORA);
 assert.deepEqual(map.get(ID),{intentos:1,ultimoMs:HORA});
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA),[]);
});

test('V2-12: HTTP 202/error no genera requests reiterados hasta la ventana SQL',()=>{
 const map=new Map();
 const gap=INTERVALO_REINTENTO_ANALISIS_V2_MS;
 assert.equal(gap,360_000);
 registrarIntentosAnalisisV2(map,[ID],HORA);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA+gap-1),[]);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA-1),[]);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA+gap),[ID]);
 registrarIntentosAnalisisV2(map,[ID],HORA+gap);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA+2*gap),[ID]);
 registrarIntentosAnalisisV2(map,[ID],HORA+2*gap);
 assert.equal(map.get(ID).intentos,MAX_INTENTOS_ANALISIS_V2);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA+20*gap),[]);
});

test('V2-12: al quedar disponible la guía se cancela todo reintento',()=>{
 const map=new Map();
 registrarIntentosAnalisisV2(map,[ID],HORA);
 const ready={...ITEM,puntos:[{categoria:'material'}]};
 assert.deepEqual(seleccionarAnalisisPendientesV2(
  [ready],map,HORA+INTERVALO_REINTENTO_ANALISIS_V2_MS),[]);
});

test('V2-12: no excede cuatro análisis simultáneos ni cien originales',()=>{
 const docs=Array.from({length:110},(_,i)=>({
  documentoId:'11111111-1111-4111-8111-'+(i+1).toString(16).padStart(12,'0'),
  puntos:[]
 }));
 const map=new Map();
 const first=seleccionarAnalisisPendientesV2(docs,map,HORA);
 assert.equal(first.length,MAX_ANALISIS_SIMULTANEOS_V2);
 assert.equal(new Set(first).size,4);
 for(const doc of docs.slice(0,MAX_ORIGINALES_ANALISIS_V2))
  registrarIntentosAnalisisV2(map,[doc.documentoId],HORA);
 assert.equal(map.size,MAX_ORIGINALES_ANALISIS_V2);
 assert.deepEqual(seleccionarAnalisisPendientesV2(
  docs.slice(MAX_ORIGINALES_ANALISIS_V2),map,HORA+360_000),[]);
});

test('V2-12: no rebasa capacidad cuando quedan solo una o dos posiciones',()=>{
 const map=new Map();
 for(let i=0;i<MAX_ORIGINALES_ANALISIS_V2-1;i++){
  map.set('00000000-0000-4000-8000-'+String(i).padStart(12,'0'),{
   intentos:3,ultimoMs:HORA
  });
 }
 const items=Array.from({length:4},(_,i)=>({
  documentoId:'11111111-1111-4111-8111-'+String(i).padStart(12,'0'),
  puntos:[]
 }));
 const chosen=seleccionarAnalisisPendientesV2(items,map,HORA);
 assert.equal(chosen.length,1);
 registrarIntentosAnalisisV2(map,chosen,HORA);
 assert.equal(map.size,MAX_ORIGINALES_ANALISIS_V2);
});

test('V2-12: datos inválidos, documentos repetidos o reloj retrocedido no disparan llamadas',()=>{
 const invalid={documentoId:'../otro',puntos:[]};
 const map=new Map();
 assert.deepEqual(seleccionarAnalisisPendientesV2(
  [invalid,ITEM,ITEM],map,HORA),[ID]);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,-1),[]);
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,NaN),[]);
 map.set(ID,{intentos:999,ultimoMs:HORA});
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA+360_000),[]);
 map.set(ID,{intentos:2,ultimoMs:HORA+360_000});
 assert.deepEqual(seleccionarAnalisisPendientesV2([ITEM],map,HORA),[]);
});

test('V2-12: UI usa recuperación acotada, JWT privado y omite análisis sin sesión',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/respuestas-comprador.tsx',
  import.meta.url),'utf8');
 assert.match(ui,/seleccionarAnalisisPendientesV2\(/u);
 assert.match(ui,/registrarIntentosAnalisisV2\(/u);
 assert.match(ui,/document\.visibilityState!=='visible'/u);
 assert.match(ui,/historialAnalisis\.current\.clear\(\)/u);
 assert.match(ui,/generation!==authGeneration\.current/u);
 assert.match(ui,/method:'POST',cache:'no-store',credentials:'omit'/u);
 assert.match(ui,/Authorization:'Bearer '\+access/u);
 assert.doesNotMatch(ui,/analysisAttempted\.current/u);
 assert.doesNotMatch(ui,/sendWhatsApp|sendMessage|\/api\/whapi/u);
});
