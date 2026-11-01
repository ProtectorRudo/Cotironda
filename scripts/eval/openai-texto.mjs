/**
 * Evaluación REAL opt-in de OpenAI en DEV: hasta tres casos sintéticos
 * para medir precisión de extracción Y destinos incorrectos, sin WhatsApp.
 *
 * Desactivada por defecto y expresamente prohibida en CI y producción.
 * Los límites locales no sustituyen presupuestos de la cuenta OpenAI.
 */
import {simularPlanesConIA,MODELO_IA_DOCUMENTAL} from '../../src/server/openai-extraccion.ts';
import {evaluarCalidadDocumental} from '../../src/domain/evaluacion-ia-documental.ts';
import {corpusGold} from '../../tests/helpers/evaluador-gold.mjs';

const LIVE=process.argv.includes('--live');
if(!LIVE){
  console.log('OFFLINE: no se llamó a OpenAI. Ejecutá npm run benchmark:ia:offline para 12 casos con mock.');
  process.exit(0);
}
if(process.env.GITHUB_ACTIONS==='true'||process.env.CI==='true'||
   process.env.VERCEL_ENV==='production' ||
   process.env.COTIRONDA_IA_LIVE_EVAL!=='AUTORIZADO_DEV' ||
   typeof process.env.OPENAI_API_KEY!=='string'){
  console.error('BLOQUEADO: evaluación live solo en DEV privado, con aprobación y clave de servidor.');
  process.exit(2);
}
// En esta evaluación se opera con un máximo de 3 requests * 3.500 tokens de
// salida. Costos ilustrativos de GPT-6 Luna Standard a 30/10/2026;
// verificar las tarifas oficiales antes de autorizar presupuesto.
const PRECIO_ENTRADA_POR_MILLON=0.10;
const PRECIO_SALIDA_POR_MILLON=0.50;
const LIMITE_SOFT_DOLARES=0.02;
const corpus=corpusGold();
const seleccion=['normal_cemento','tres_rubros','numero_ambiguo_retenido'];
let totalUSD=0;
const salida=[];
for(const id of seleccion){
  if(totalUSD>=LIMITE_SOFT_DOLARES)break;
  const caso=corpus.scenarios.find(c=>c.id===id);
  if(!caso)throw new Error('corpus_no_compatible');
  try{
    const r=await simularPlanesConIA({
      texto:caso.texto,
      apiKey:process.env.OPENAI_API_KEY,
      habilitarLlamadaExterna:true,
      solicitud:{
        id:'ronda_eval_0001',zona_entrega:'la_plata',
        envio_autorizado_por_comprador:true
      },
      // Fixtures verificados, no direcciones ni teléfonos auténticos.
      proveedores:caso.proveedores
    });
    const metrics=evaluarCalidadDocumental({
      esperados:caso.esperados,destinos_esperados:caso.destinos_esperados,
      borrador:r.extraccion.borrador,plan:r.plan
    });
    const t=r.extraccion.tokens;
    const usd=t?
      (t.entrada*PRECIO_ENTRADA_POR_MILLON+
       t.salida*PRECIO_SALIDA_POR_MILLON)/1_000_000:null;
    if(usd===null)throw new Error('ia_usage_no_disponible');
    totalUSD+=usd;
    salida.push({
      caso:id,seguridad:metrics.puerta_seguridad,
      cobertura:metrics.puerta_cobertura,
      exactos:metrics.extraccion.exactos,
      omitidos:metrics.extraccion.omitidos,
      inventados:metrics.extraccion.inventados,
      destinatarios_incorrectos:metrics.distribucion.incorrectos,
      destinatarios_correctos:metrics.distribucion.correctos,
      lineas_retenidas:metrics.distribucion.lineas_retenidas,
      tokens:t,
      costo_estimado_usd:Math.round(usd*1000000)/1000000
    });
  }catch(e){
    const msg=e instanceof Error?e.message:'ia_error_no_clasificado';
    const codigo=/^ia_[a-z_]+$/.test(msg)?msg:'ia_error_no_clasificado';
    salida.push({caso:id,estado:'ERROR',codigo});
    break; // Ante error/usage faltante, no insistir ni gastar en reintentos.
  }
}
const exitos=salida.filter(x=>x.seguridad==='PASS'&&x.cobertura==='PASS').length;
console.log(JSON.stringify({
  modo:'live_DEV_sin_envio',
  modelo:MODELO_IA_DOCUMENTAL,
  pruebas_ejecutadas:salida.length,
  pruebas_aprobadas:exitos,
  seguridad_aprobada:salida.every(x=>x.seguridad==='PASS'),
  cobertura_aprobada:salida.every(x=>x.cobertura==='PASS'),
  costo_estimado_usd:Math.round(totalUSD*1000000)/1000000,
  maximo_soft_usd:LIMITE_SOFT_DOLARES,
  advertencia:'Costo estimado, no tope de facturación ni precisión general. No habilita producción.',
  resultados:salida
},null,2));
if(exitos!==seleccion.length||totalUSD>LIMITE_SOFT_DOLARES)process.exitCode=1;
