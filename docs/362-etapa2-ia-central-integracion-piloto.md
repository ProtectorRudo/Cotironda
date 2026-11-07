# Decisión 362 — Etapa 2 IA Central: integración y criterios de cierre

**Fecha:** 06/11/2026. **Entorno:** Supabase `cotironda-piloto`
(`ilggkalaafhtiysyzlmg`). **NO producción.**

## Implementación integrada

- MVP236: solo cuenta una invitación LEGACY si Whapi aceptó el envío
  real antes de recibirse el presupuesto; dos solicitudes realmente
  acreditadas obligan a abstenerse.
- MVP237: ledger privado de presupuestos no asociados, idempotencia por
  HMAC, sin precios, contactos, ni elección automática de comprador.
- MVP238: relaciona aviso corto «Te paso el presupuesto» con **un solo**
  adjunto posterior en el mismo chat, previamente archivado y verificado
  por SHA256; ante mensajes intercalados o nueva invitación no conjetura.
- MVP239: envía una aclaración mínima **solo** si están habilitados
  consentimiento, flags SQL de WhatsApp, cuota y bandera independiente
  `COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED=true`. Un resultado
  Whapi incierto no se reenvía. El proveedor puede responder citando el
  **mensaje original** de la solicitud; la cita se coteja con el ID
  recibido de la API Whapi para ese proveedor y ronda aún abierta.
  No se vuelven a pedir precios ni archivos.
- La aclaración se resuelve únicamente cuando hay una sola fuente
  pendiente del mismo proveedor; la fuente original debe ser posterior
  al envío de la invitación citada. El texto «es de este pedido» sin
  citar dicho mensaje no se guarda como presupuesto.
- Fuente textual y archivo originales se conservan; la asociación
  **no equivale a verificación económica**. Para fuentes textuales
  antiguas, la revisión económica puede requerir recuperación posterior.

## Evidencia técnica verificada

1. PR #614 (MVP233–MVP235), integrado a desarrollo:
   `49b4d9ae617a4652157ca7ab6a10f5988c822710`.
2. PR #617 (MVP236–MVP239), integrado a desarrollo:
   `7b1bd9aacbd7cc1b742d622f1163f26c96503068`.
   PR #615 y #616 cerrados como contenidos incluidos, sin integrarlos
   otra vez.
3. GitHub Actions sobre el commit integrado #617:
   **25 controles completados SUCCESS**, incluyendo Node, PG17, Deno
   Whapi y Next.js.
4. Simulación SQL en el proyecto piloto `BEGIN/ROLLBACK` antes de
   instalar: migraciones combinadas compatibles con la base real.
5. Migraciones aplicadas en piloto, en este orden:
   `piloto_mvp236_asociacion_invitaciones_whapi_aceptadas`,
   `piloto_mvp237_registro_privado_asociaciones_pendientes`,
   `piloto_mvp238_aviso_proveedor_archivo_posterior`,
   `piloto_mvp239_aclaracion_por_pedido_citado`.
6. `cotironda-piloto-whapi` **v54 ACTIVE**, 37 archivos; los tres
   archivos fuente modificados/nuevos coinciden exactamente con
   la rama GitHub de desarrollo. Bandera de nuevas aclaraciones OFF
   por defecto.
7. Comprobación SQL posterior: `anon`/`authenticated` no pueden
   ejecutar las funciones privadas de aclaración, RLS en los ledgers.
   Llamada a la reserva con origen ficticio retorna `disabled`;
   resolución con origen ficticio retorna `not_authorized`.
8. Tres controles IA en OFF, tres rondas históricas intactas,
   cero registros nuevos de vínculos IA, avisos, aclaraciones y
   despachos IA. No se envió ningún WhatsApp en el despliegue.

## Prueba real que falta para el cierre definitivo

No se considera completada **operativamente** la etapa 2 sin un E2E
controlado y autorizado con:
- Dos rondas simultáneas, mismo proveedor, materiales parecidos.
  El presupuesto sin referencia no debe asignarse por conjetura.
- Una respuesta al PDF original correctamente citada: debe asociarse
  solo al pedido exacto. Cita de otro proveedor o ID inexistente:
  debe quedar sin asociación.
- Aviso «Te paso el presupuesto» seguido de PDF/Excel, y otro archivo
  intercalado: primera continuidad segura, segundo caso en revisión.
- Retransmisión de webhook: ningún duplicado de presupuestos ni mensajes.
- Presupuesto de texto y archivo conservados íntegros, sin inventar
  condiciones comerciales, precios, IVA ni contacto.
- Cierre de ronda, y respuestas fuera de ventana: no mezclar fuente
  con una licitación posterior.
- Solo durante la prueba autorizada, habilitar y luego volver a apagar
  los controles de comunicación necesarios; no tocar producción.

**Estado:** implementación y pruebas técnicas completadas en piloto,
**validación real E2E pendiente**. No promover a producción ni afirmar
que WhatsApp real funciona de punta a punta hasta esa prueba.
