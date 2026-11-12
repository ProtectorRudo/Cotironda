/** Cotironda V2-11: consulta ligera del listado privado mientras la vista
 * está abierta. No abre WhatsApp ni ejecuta IA: la API GET mantiene Auth/RLS.
 */
export const INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS=60_000;

export type EstadoConsultaRespuestasV2=Readonly<{
 autenticado:boolean;
 paginaVisible:boolean;
 ocupado:boolean;
 consultaEnCurso:boolean;
}>;

/** Una consulta en segundo plano requiere sesión, pestaña visible y ausencia
 * de operaciones/consultas previas. Ninguna lectura se inicia por sí sola
 * fuera del portal del comprador.
 */
export function debeActualizarRespuestasV2(
 estado:EstadoConsultaRespuestasV2
):boolean{
 return estado.autenticado===true&&estado.paginaVisible===true&&
  estado.ocupado===false&&estado.consultaEnCurso===false;
}
