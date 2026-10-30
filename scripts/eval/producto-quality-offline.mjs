/**
 * Benchmark calidad por PRODUCTO y destinatario, offline sintético.
 * exitCode=1 si las puertas se comportan diferente del gold independiente.
 */
import {correrGoldProductoCompleto} from '../../tests/helpers/evaluador-producto.mjs';
const r=await correrGoldProductoCompleto();
console.log(JSON.stringify({
  modo:r.modo,version:r.version,escenarios:r.escenarios,
  clasificaciones_correctas:r.clasificaciones_correctas,
  solicitudes_openai_reales:r.solicitudes_openai_reales,
  whatsapp_reales:r.whatsapp_reales,
  detalle:r.resultados.map(x=>({
    caso:x.id,esperado:x.gates,
    seguridad:x.informe.puerta_seguridad,cobertura:x.informe.puerta_cobertura,
    extraccion:x.informe.extraccion,
    invitaciones:x.informe.invitaciones,
    requests_mock:x.calls
  }))
},null,2));
if(r.clasificaciones_correctas!==r.escenarios||r.resultados.some(x=>x.calls!==1))
  process.exitCode=1;
