/**
 * DEV-only quality benchmark of the ACTUAL D015/D016 extraction pipeline.
 * The only selectable texts and vendors are synthetic, versioned gold cases.
 * No arbitrary prompts, catalog uploads, access to DB or WhatsApp.
 *
 * Core sources are byte-identical snapshots of src/*, enforced by unit tests.
 */
import {escenariosProducto} from './core/fixtures/gold-invitaciones-producto-v1.mjs';
import {simularRondaConCalidadIA} from './core/server/flujo-calidad-ia.ts';
import {evaluarCalidadInvitacionesPorProducto}
  from './core/domain/evaluacion-invitaciones-producto.ts';

export const CASOS_LAB=Object.freeze([
  'marca_mencionada_y_presentacion_distinta',
  'cemento_generico_sin_especificacion_inventada',
  'cemento_cpc_50_a_avellaneda_25',
  'dos_productos_misma_linea',
  'solo_marca_exclusiva',
  'RH_pedido_RF_cotizacion_diferente_no_homologada'
]);

export async function evaluarCasoCalidadDev(
  caseId:string,apiKey:string,fetcher:typeof fetch=fetch
):Promise<Readonly<Record<string,unknown>>>{
  if(!CASOS_LAB.includes(caseId))throw new Error('lab_caso_no_permitido');
  const caso=escenariosProducto.find(c=>c.id===caseId);
  if(!caso)throw new Error('lab_caso_no_permitido');
  const plan=await simularRondaConCalidadIA({
    texto:caso.texto,
    solicitud:{id:'ronda_quality_lab_ficticia',zona_entrega:'la_plata',
      envio_autorizado_por_comprador:true},
    proveedores:caso.proveedores,
    apiKey,habilitarLlamadaExterna:true,fetchImpl:fetcher
  });
  // Numeric diagnostics only, computed from already-validated extraction.
  // Never persist text, model responses, product descriptions or credentials.
  const extraidos=plan.resultado.extraccion.borrador.lineas;
  const diagnostico={
    items_propuestos:extraidos.length,
    items_con_aclaracion:extraidos.filter(x=>x.requiere_aclaracion.length>0).length,
    origen_no_verificado:extraidos.filter(x=>x.requiere_aclaracion.includes('origen_no_verificado')).length,
    cantidad_sin_evidencia:extraidos.filter(x=>x.requiere_aclaracion.includes('cantidad_sin_evidencia')).length,
    segmentos_sin_extraccion:plan.resumen.segmentos_sin_extraccion,
    items_retenidos:plan.lineas.reduce((n,x)=>n+(x.estado==='retenida'?1:0),0)
  };
  // Gold is compared *after* model inference; never passed to OpenAI.
  const medicion=evaluarCalidadInvitacionesPorProducto({
    esperados:caso.esperados,
    resultado:plan
  });
  return {
    status:'quality_case_completed',
    caso:caseId,
    modelo:plan.modelo,
    tokens:plan.tokens,
    diagnostico,
    seguridad:medicion.puerta_seguridad,
    cobertura:medicion.puerta_cobertura,
    extraccion:{
      esperados:medicion.extraccion.esperados,
      exactos:medicion.extraccion.exactos,
      omitidos:medicion.extraccion.omitidos,
      alterados:medicion.extraccion.alterados_o_no_reconocidos
    },
    invitaciones:{
      esperadas:medicion.invitaciones.esperadas,
      correctas:medicion.invitaciones.correctas,
      omitidas:medicion.invitaciones.omitidas,
      incorrectas:medicion.invitaciones.incorrectas
    },
    lineas:plan.lineas.map(l=>({
      linea_fuente:l.linea_fuente,estado:l.estado,
      segmentos_sin_extraccion:l.segmentos_sin_extraccion
    })),
    envio_habilitado:false,
    proveedores_reales:0,
    mensajes_whatsapp:0
  };
}
