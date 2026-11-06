# Decisión 359 — Ledger privado para presupuestos sin asociación unívoca (MVP237)

## Problema
Cuando el proveedor tiene dos o más invitaciones válidamente enviadas, el
vínculo automático de `MVP225` devuelve `ambiguous_round` y no asocia
la cotización. Ese bloqueo es correcto, pero el resultado no tenía un
registro privado específico que permitiera supervisar el pendiente y
evitar que la operación pasase inadvertida.

## Contrato
- Tabla privada `ai_supplier_unresolved_mvp237` con **una fila por mensaje
  HMAC**; registra proveedor interno, SHA de la fuente, tipo de archivo,
  método de asociación, motivo exacto y cantidad de rondas candidatas.
- Estados: `ambiguous_round`, `not_matched`,
  `media_context_conflict`. No almacena teléfonos, texto de presupuestos,
  importes, datos del comprador ni una ronda elegida a fuerza.
- Solo se escribe después de confirmar la identidad consentida del
  proveedor y la correspondencia de la fuente con el mensaje cifrado o
  archivo archivado.
- No cambia el flujo de presupuestos ya correctamente vinculados.
- Idempotencia `ON CONFLICT (message_hmac) DO NOTHING`.
- RLS en esquema privado y ninguna autorización directa para
  `anon`, `authenticated` ni `service_role` sobre el ledger. El
  `service_role` puede llamar al RPC privado que registra el hecho.

## Pruebas
PG17 con rollback: una invitación legacy no enviada no genera ambigüedad,
dos envíos válidos sí; el pendiente queda registrado; repetición no
duplica registros; cita exacta asocia solo a proveedor y ronda correctos;
inventada o ajena queda sin vincular; verificación de RLS y ACL.

## Próxima integración
En una segunda iteración, un supervisor autorizado podrá revisar estos
pendientes y pedir una **única aclaración corta** al proveedor, sin exponer
compradores ni inventar a cuál pedido correspondía el presupuesto. Nunca
se envía un mensaje ni se asigna una ronda desde esta migración.

**Estado verificado 06/11/2026:** MVP237 instalado exclusivamente en
Supabase `cotironda-piloto`, ledger vacío y RLS activo; sin nuevos
WhatsApps ni gastos de IA. MVP239 implementa la aclaración posterior.
La prueba WhatsApp real de etapa 2 continúa pendiente (decisión 362).
