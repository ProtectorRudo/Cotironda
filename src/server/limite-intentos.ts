/**
 * Guardián explícito: NO aprobar altas hasta contar con una cuota persistente,
 * atómica y aplicada también a la RPC accesible por PostgREST.
 *
 * Un contador en memoria / una cuota sólo en Next.js no sirve en serverless:
 * las solicitudes pueden llegar a distintas instancias o directamente a Supabase.
 *
 * La ruta HTTP convertirá este error en 503, nunca en autorización.
 */
export async function autorizarIntentoDeRegistro(_userId: string): Promise<boolean> {
  throw new Error('limite_de_intentos_no_configurado');
}
