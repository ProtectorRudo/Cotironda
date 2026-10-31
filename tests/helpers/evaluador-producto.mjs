/**
 * Mocks deliberados e independientes del GOLD. Nunca invoca API real.
 * NO acredita precisión del modelo: mide solamente la instrumentación.
 */
import {escenariosProducto,GOLD_PRODUCTO_VERSION}
  from '../fixtures/gold-invitaciones-producto-v1.mjs';
import {simularRondaConCalidadIA} from '../../src/server/flujo-calidad-ia.ts';
import {evaluarCalidadInvitacionesPorProducto}
  from '../../src/domain/evaluacion-invitaciones-producto.ts';

const fake='sk-oro_producto_sintetico_1234567890';
export {escenariosProducto,GOLD_PRODUCTO_VERSION};
export async function correrCasoProducto(s){
  let calls=0;
  const fetchImpl=async(url,opts)=>{
    calls++;
    if(url!=='https://api.openai.com/v1/responses')throw Error('url_invalida');
    const request=JSON.parse(opts.body);
    if(request.store!==false||request.tools.length!==0)throw Error('api_no_segura');
    return new Response(JSON.stringify({
      status:'completed',
      output:[{type:'message',role:'assistant',content:[
        {type:'output_text',text:JSON.stringify({items:s.items})}
      ]}],usage:{input_tokens:160,output_tokens:95}
    }),{status:200});
  };
  const resultado=await simularRondaConCalidadIA({
    texto:s.texto,apiKey:fake,habilitarLlamadaExterna:true,
    fetchImpl,proveedores:s.proveedores,
    solicitud:{id:'ronda_gold_producto',zona_entrega:'la_plata',
      envio_autorizado_por_comprador:true}
  });
  const informe=evaluarCalidadInvitacionesPorProducto({
    esperados:s.esperados,resultado
  });
  return{id:s.id,informe,resultado,calls,gates:s.gates};
}
export async function correrGoldProductoCompleto(){
  const resultados=[];
  for(const caso of escenariosProducto)resultados.push(await correrCasoProducto(caso));
  const clasificados=resultados.filter(x=>
    x.gates.seguridad===x.informe.puerta_seguridad&&
    x.gates.cobertura===x.informe.puerta_cobertura).length;
  return{
    modo:'benchmark_producto_mock_offline',
    version:GOLD_PRODUCTO_VERSION,
    escenarios:resultados.length,
    clasificaciones_correctas:clasificados,
    solicitudes_openai_reales:0,
    whatsapp_reales:0,
    resultados
  };
}
