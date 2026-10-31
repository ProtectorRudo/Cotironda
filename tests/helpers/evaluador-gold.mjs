/**
 * Harness de calidad para datos sintéticos de Cotironda.
 * MOCK de Responses: NO ejecuta IA, NO tiene acceso a números de WhatsApp,
 * NO prueba la precisión real de ningún modelo.
 */
import {readFileSync} from 'node:fs';
import {simularPlanesConIA} from '../../src/server/openai-extraccion.ts';
import {evaluarCalidadDocumental} from '../../src/domain/evaluacion-ia-documental.ts';

const fixtureURL=new URL('../fixtures/gold-despacho-ia-v1.json',import.meta.url);
const CORPUS=JSON.parse(readFileSync(fixtureURL,'utf8'));
const fakeSecret='sk-oro_sintetico_1234567890';

export function corpusGold(){return CORPUS;}
export async function correrCasoGold(escenario){
  let requests=0;
  const fetchImpl=async(url,opts)=>{
    requests++;
    if(url!=='https://api.openai.com/v1/responses')throw Error('endpoint_no_permitido');
    const parsed=JSON.parse(opts.body);
    if(parsed.store!==false || parsed.tools.length!==0)throw Error('contrato_api_inseguro');
    return new Response(JSON.stringify({
      status:'completed',
      output:[{type:'message',role:'assistant',content:[{
        type:'output_text',text:JSON.stringify({items:escenario.items})
      }]}],
      usage:{input_tokens:190,output_tokens:120}
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  const resultado=await simularPlanesConIA({
    texto:escenario.texto,
    solicitud:{id:'ronda_gold_00001',zona_entrega:'la_plata',
      envio_autorizado_por_comprador:true},
    proveedores:escenario.proveedores,fetchImpl,
    apiKey:fakeSecret,habilitarLlamadaExterna:true
  });
  const informe=evaluarCalidadDocumental({
    esperados:escenario.esperados,
    destinos_esperados:escenario.destinos_esperados,
    borrador:resultado.extraccion.borrador,plan:resultado.plan
  });
  return {id:escenario.id,informe,requests,
    lines_without_extraction:resultado.extraccion.lineas_sin_extraccion};
}
export async function correrGoldCompleto(){
  const casos=[];
  for(const escenario of CORPUS.scenarios){
    const r=await correrCasoGold(escenario);
    casos.push({...r,gate_esperado:escenario.gates});
  }
  return{
    modo:'mock_offline_sin_costos',
    version:CORPUS.version,
    casos:casos.length,
    simulaciones_correctamente_clasificadas:casos.filter(x=>
      x.informe.puerta_seguridad===x.gate_esperado.seguridad &&
      x.informe.puerta_cobertura===x.gate_esperado.cobertura).length,
    pruebas_que_deben_ser_rechazadas:casos.filter(x=>x.gate_esperado.seguridad==='FAIL').length,
    llamadas_a_openai_real:0,
    solicitudes_whatsapp_reales:0,
    resultados:casos
  };
}
