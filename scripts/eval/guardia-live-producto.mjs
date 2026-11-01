/**
 * Guardas puras de laboratorio para benchmark de proveedor por PRODUCTO.
 * NO hacen solicitudes externas y nunca leen ni imprimen secretos.
 */
export const MODELO_EVAL='gpt-6-luna';
export const PRECIO_USD_MTOK=Object.freeze({entrada:0.10,salida:0.50});
export const MAX_CASOS=6;
export const MAX_INPUT_TOKENS_RESERVA=10000;
export const MAX_OUTPUT_TOKENS_RESERVA=3500;
export const PRESUPUESTO_SOFT_USD=0.02;
export const RESERVA_POR_REQUEST_USD=
  (MAX_INPUT_TOKENS_RESERVA*PRECIO_USD_MTOK.entrada+
   MAX_OUTPUT_TOKENS_RESERVA*PRECIO_USD_MTOK.salida)/1_000_000;
export const CASOS_LIVE=Object.freeze([
  'marca_mencionada_y_presentacion_distinta',
  'cemento_generico_sin_especificacion_inventada',
  'cemento_cpc_50_a_avellaneda_25',
  'dos_productos_misma_linea',
  'solo_marca_exclusiva',
  'RH_pedido_RF_cotizacion_diferente_no_homologada'
]);
const envSafe=(v)=>typeof v==='string'&&v.length>0;
export function validarGuardiaLive({argv=[],env={}}={}){
  if(!Array.isArray(argv)||!argv.includes('--live'))
    return {habilitado:false,codigo:'live_requiere_optin'};
  if(env.GITHUB_ACTIONS||env.CI||env.VERCEL_ENV||env.NODE_ENV==='production')
    return {habilitado:false,codigo:'live_solo_dev_local'};
  if(env.COTIRONDA_IA_LIVE_EVAL!=='AUTORIZADO_DEV'||
     env.COTIRONDA_IA_MAX_USD!=='0.02')
    return {habilitado:false,codigo:'live_sin_aprobacion_presupuesto'};
  if(!envSafe(env.OPENAI_API_KEY)||!/^sk-[\w-]{16,}$/.test(env.OPENAI_API_KEY))
    return {habilitado:false,codigo:'live_sin_clave_servidor'};
  // El monto SOFT reserva espacio por solicitud. NO controla facturación del proveedor.
  if(MAX_CASOS*RESERVA_POR_REQUEST_USD>PRESUPUESTO_SOFT_USD)
    return {habilitado:false,codigo:'live_reserva_excede_presupuesto'};
  return {habilitado:true,codigo:'live_autorizado'};
}
export function estimarCosto({entrada,salida}){
  if(!Number.isSafeInteger(entrada)||entrada<0||
    !Number.isSafeInteger(salida)||salida<0)
    throw new TypeError('uso_tokens_invalido');
  return (entrada*PRECIO_USD_MTOK.entrada+
    salida*PRECIO_USD_MTOK.salida)/1_000_000;
}
export function permitirSiguienteReserva(costoEstimado,siguientes=1){
  return Number.isFinite(costoEstimado)&&costoEstimado>=0&&
    Number.isSafeInteger(siguientes)&&siguientes>=1&&
    costoEstimado+(siguientes*RESERVA_POR_REQUEST_USD)<=PRESUPUESTO_SOFT_USD+1e-12;
}
