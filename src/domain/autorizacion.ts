/** Autoriza administración del catálogo a partir de membresía LEÍDA EN SERVIDOR. */
export type MembresiaConfiable = Readonly<{
  userId: string;
  organizationId: string;
  role: 'owner' | 'manager' | 'member';
  status: 'active' | 'suspended';
}>;
export type AccionCatalogo = 'leer' | 'editar';
export function puedeGestionarCatalogo(
  userId: string,
  organizationId: string,
  membresia: MembresiaConfiable | null,
  accion: AccionCatalogo
): boolean {
  if (!userId || !organizationId || !membresia) return false;
  if (membresia.userId !== userId || membresia.organizationId !== organizationId) return false;
  if (membresia.status !== 'active') return false;
  if (accion === 'leer') return true;
  return accion === 'editar' && (membresia.role === 'owner' || membresia.role === 'manager');
}
