/**
 * Primer benchmark LIVE de producto D015. SOLO DEV LOCAL OPT-IN.
 * No abre APIs públicas, no envía WhatsApp, no modifica DB, no imprime
 * prompts, resultados crudos ni credenciales.
 *
 * La reserva es un límite preventivo SOFTWARE, no límite de gasto de OpenAI:
 * configurar presupuesto/cupo en la cuenta antes de activar este archivo.
 */
import {
  CASOS_LIVE,MAX_CASOS,MODELO_EVAL,PRECIO_USD_MTOK,
  RESERVA_POR_REQUEST_USD,PRESUPUESTO_SOFT_USD,validarGuardiaLive,
  estimarCosto,permitirSiguienteReserva
} from './guardia-live-producto.mjs';

const guardia=validarGuardiaLive({argv:process.argv,env:process.env});
if(!guardia.habilitado){
  console.log(JSON.stringify({
    modo:'BLOQUEADO_sin_red',codigo:guardia.codigo,
    modelo:MODELO_EVAL,escenarios_maximos:MAX_CASOS,
    presupuesto_soft_usd:PRESUPUESTO_SOFT_USD,
    advertencia:'Sin llamada a OpenAI ni WhatsApp. Requiere entorno DEV, clave privada y autorización explícita.'
  },null,2));
  if(process.argv.includes('--live'))process.exitCode=2;
}else{
  // Importar evaluador y código de IA SOLO tras validar las guardas. Así
  // el modo bloqueado ni siquiera carga el motor ni prepara un request.
  const {escenariosProducto}=await import('../../tests/fixtures/gold-invitaciones-producto-v1.mjs');
  const {simularRondaConCalidadIA}=await import('../../src/server/flujo-calidad-ia.ts');
  const {evaluarCalidadInvitacionesPorProducto}=
    await import('../../src/domain/evaluacion-invitaciones-producto.ts');
  const resultados=[];
  let gasto=0;
  let fallo=false;
  const seleccion=CASOS_LIVE.map(id=>escenariosProducto.find(s=>s.id===id));
  if(seleccion.some(x=>!x)||seleccion.length>MAX_CASOS)throw new Error('gold_live_invalido');
  for(const escenario of seleccion){
    if(!permitirSiguienteReserva(gasto)){fallo=true;break;}
    try {
      // NUNCA pasar gold ni respuestas simuladas al modelo.
      // Los catálogos de esta ronda son sintéticos y fueron fijados antes.
      const plan=await simularRondaConCalidadIA({
        texto:escenario.texto,
        solicitud:{
          id:'ronda_live_gold_producto',zona_entrega:'la_plata',
          envio_autorizado_por_comprador:true
        },
        proveedores:escenario.proveedores,
        apiKey:process.env.OPENAI_API_KEY,
        habilitarLlamadaExterna:true
      });
      const informe=evaluarCalidadInvitacionesPorProducto({
        esperados:escenario.esperados,resultado:plan
      });
      if(!plan.tokens)throw new Error('ia_usage_no_disponible');
      const costo=estimarCosto(plan.tokens);
      gasto+=costo;
      resultados.push({
        caso:escenario.id,
        seguridad:informe.puerta_seguridad,
        cobertura:informe.puerta_cobertura,
        articulos_correctos:informe.extraccion.exactos,
        articulos_omitidos:informe.extraccion.omitidos,
        articulos_alterados:informe.extraccion.alterados_o_no_reconocidos,
        proveedores_correctos:informe.invitaciones.correctas,
        proveedores_omitidos:informe.invitaciones.omitidas,
        proveedores_incorrectos:informe.invitaciones.incorrectas,
        lineas_parciales:informe.lineas_fuente.parciales,
        tokens:plan.tokens,
        costo_estimado_usd:+costo.toFixed(7)
      });
      if(informe.puerta_seguridad!=='PASS'||informe.puerta_cobertura!=='PASS')
        fallo=true;
      if(gasto>=PRESUPUESTO_SOFT_USD)break;
    }catch(e){
      const mensaje=e instanceof Error?e.message:'error';
      const codigo=/^ia_[a-z_]+$/u.test(mensaje)?mensaje:'eval_error_controlado';
      resultados.push({caso:escenario.id,estado:'ERROR',codigo});
      fallo=true;
      break; // No reintentar ante 429/error/desconocido: evitar costo extra.
    }
  }
  const aprobado=!fallo&&resultados.length===seleccion.length&&
    resultados.every(r=>r.seguridad==='PASS'&&r.cobertura==='PASS');
  console.log(JSON.stringify({
    modo:'live_DEV_sin_envio',modelo:MODELO_EVAL,
    tarifas_estandar_usd_mtoks:PRECIO_USD_MTOK,
    limite_soft_usd:PRESUPUESTO_SOFT_USD,
    reserva_por_request_usd:+RESERVA_POR_REQUEST_USD.toFixed(7),
    casos_previstos:CASOS_LIVE.length,
    casos_ejecutados:resultados.length,
    pruebas_aprobadas:resultados.filter(r=>
      r.seguridad==='PASS'&&r.cobertura==='PASS').length,
    evaluacion_aprobada:aprobado,
    costo_estimado_usd:+gasto.toFixed(7),
    mensajes_whatsapp:0,
    advertencia:'NO es un límite de facturación ni prueba de calidad estadística. Configurar cupo en consola OpenAI.',
    resultados
  },null,2));
  if(!aprobado)process.exitCode=1;
}
