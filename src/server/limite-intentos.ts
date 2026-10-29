/**
 * Hasta disponer de control de intentos DURABLE (no in-memory en Vercel),
 * el registro HTTP no debe permitir ninguna alta. Fallo seguro por diseño.
 * También hay que limitar las llamadas directas a la RPC de Supabase antes
 * de habilitar la cerradura de base de datos.
 */
export async function rechazarIntentosSinLimitador(_actorId: string): Promise<boolean> {
  throw new Error('limitador_no_configurado');
}
