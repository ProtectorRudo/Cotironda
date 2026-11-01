/**
 * Banco de calidad offline. Evaluar un MOCK jamás acredita que el modelo
 * produzca respuestas equivalentes. No llamadas a OpenAI, no gastos, no WhatsApp.
 */
import {correrGoldCompleto} from '../../tests/helpers/evaluador-gold.mjs';
const resultado=await correrGoldCompleto();
console.log(JSON.stringify({
  modo:resultado.modo,
  version:resultado.version,
  casos:resultado.casos,
  correctamente_clasificados:resultado.simulaciones_correctamente_clasificadas,
  casos_adversariales_rechazados:resultado.pruebas_que_deben_ser_rechazadas,
  llamadas_openai_real:resultado.llamadas_a_openai_real,
  mensajes_whatsapp_reales:resultado.solicitudes_whatsapp_reales,
  resultados:resultado.resultados.map(x=>({
    caso:x.id,
    seguridad:x.informe.puerta_seguridad,
    cobertura:x.informe.puerta_cobertura,
    falsos_destinatarios:x.informe.distribucion.incorrectos,
    destinos_correctos:x.informe.distribucion.correctos,
    destinos_esperados:x.informe.distribucion.destinos_esperados,
    articulos_inventados:x.informe.extraccion.inventados,
    lineas_retenidas:x.informe.distribucion.lineas_retenidas
  }))
},null,2));
if(resultado.simulaciones_correctamente_clasificadas!==resultado.casos){
  process.exitCode=1;
}
