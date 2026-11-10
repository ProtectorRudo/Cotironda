# Decisión 466 — MVP334: circuito mínimo de una ronda con dos proveedores

**Fecha:** 09/11/2026 (ART). **Orden:** «Luz verde», solo desarrollar y probar. Ninguna publicación nueva, secreto modificado, SQL de escritura, WhatsApp, uso del modelo ni cron activado.

**Objetivo:** evitar activar simultáneamente MVP306/MVP314/MVP315 para un piloto que tiene **un comprador y exactamente dos proveedores**. Probar primero el recorrido normal con la mínima superficie de riesgo.

## Hallazgo de arquitectura

El webhook activo v71 ya incluye un recorrido inmediato para dos proveedores. El cliente recibe un pedido por WhatsApp, la IA Central lo interpreta y prepara en sombra; la función liberarPedidoAutomaticoMvp306 requiere a la vez el flag privado COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED en true, los controles vigentes y la RPC SQL de liberación. La ruta inmediata despacharSolicitudCentralMvp223 usa maxJobs:2. Después, buyerLinkRequests puede contener mode:auto y notificarSeguimientoMvp289 emite un solo enlace al comprador, siempre después de comprobar los despachos aceptados en SQL.

Por tanto, para una **única ronda con dos proveedores** no es preciso publicar ni activar el worker diferido MVP314, ni su aviso diferido MVP315. Estos dos componentes son independientes y siguen en OFF. Tampoco hay que agregar un cron. Si el ruteo semántico elige solo un proveedor, no afirmar dos PDFs: el objetivo requiere verificar el ruteo de una lista elegible para ambos sin forzar invitaciones no pertinentes.

**No es garantía de WhatsApp entregado:** API accepted es distinto de delivered; ambos deben verificarse si Whapi emite estados. Y el enlace de seguimiento requiere las condiciones SQL existentes y la configuración protegida vigente.

## Auditoría del piloto realizada — solo lectura

Consulta SQL comprobada en vivo a las **00:30:47 UTC del 10/11/2026**, equivalentes a las 21:30:47 ART del 09/11/2026, proyecto **cotironda-piloto** ref ilggkalaafhtiysyzlmg.

| Comprobación agregada | Resultado |
|---|---|
| Comprador activo/vinculado | 1 / 1 |
| Proveedores activos/contactables | 2 / 2 |
| Autorizaciones administrativas con alcance | 1 comprador + 2 proveedores |
| Líneas de catálogo totales | 106 |
| Líneas con familia comercial asignada | 86 |
| Líneas pendientes de revisión | 20 |
| Catálogos formalmente no confirmados | 2 |
| Estado de IA Central + despacho antiguo | Activos |
| Recepción real de comprador última jornada | 1 |
| Jobs/outbox pendientes, leased o inciertos | 0 / 0 |
| Gate MVP306 / MVP314 / MVP315 | OFF / OFF / OFF |
| Limitador lote MVP314 | 20 intentos/día, 8 por comprador (aunque OFF) |
| Limitador avisos MVP315 | 10 avisos/día (aunque OFF) |
| Cron asociado a lotes | 0, no necesario para dos proveedores |

La consulta scripts/piloto/mvp334-dos-proveedores-preflight-readonly.sql devolvió **preflight_sql_apto=true**. Esto demuestra preparación SQL para empezar a planificar, **no autoriza automáticamente ni acredita credenciales externas, estado AUTH, cupo de Whapi o control de gastos de OpenAI**.

Catálogos **registrados** sirven para invitaciones; la confirmación de stock, precio o existencia no se presume. La ruta actual de IA acepta catálogos registrados sin confirmación formal, pero necesita validar semanticamente pedido y ruteo artículo por artículo. No falsificar aprobaciones ni marcarlos como stock verificado.

## Validaciones preparadas bajo Luz verde

- scripts/piloto/mvp334-dos-proveedores-preflight-readonly.sql: SELECT agregado, sin nombres comerciales, teléfonos, HMAC, textos, precios, claves o documentos; ejecutado exitosamente contra la base real sin modificarla.
- scripts/piloto/mvp334-minimal-two-supplier-decision.mjs: función pura que comprueba evidencia de 1+2, permisos, catálogos, enlace del comprador, reconciliación, gates OFF y recepción reciente. Salida intencional: sql_apto_para_preparacion_controlada **nunca** habilitacion_ejecucion. Siempre deja pendiente la comprobación externa y token/secretos. También verifica anclajes críticos del flujo inmediato.
- tests/unit/mvp334-two-supplier-readiness.test.mjs: casos normales, proveedores extra/no contactables, permisos ausentes, sin catálogo, sin webhook, flags ya activos, reclamos inciertos, datos adulterados, sin recepción, etc. Ningún envío.
- .github/workflows/cotironda-mvp334-two-supplier-preflight.yml: Node y regresiones anteriores, sin conectar a Supabase ni llamar Whapi.

## Orden mínimo para una futura orden «Publicalo»

1. Verificar que webhook MVP333 candidato contra el hash activo v71 siga íntegro, y **publicar una versión v72 controlada**. Esta publicación no debe encender gates ni enviar.
2. Corroborar desde entorno protegido, sin volcar secretos en chat, que outbound/dynamic-recipient/central-dispatch/auto-release flag necesarios están configurados; verificar estado AUTH, cuota restante del Sandbox y límite/costo OpenAI. El dueño decidió mantener el token de una captura previa, por lo que permanece un riesgo para **cualquier envío**, no una credencial segura para producción.
3. Repetir la auditoría SQL MVP334: si cualquier job está incierto, si aparecen nuevos destinatarios, permisos revocados, gates encendidos o no hay recepción reciente, **no activar automáticamente**.
4. Bajo autorización de publicación del piloto y tras control de entorno, habilitar **solo la liberación prospectiva MVP306**. Dejar MVP314 y MVP315 OFF. Asegurar el control en SQL con activated_at real para no reabrir rondas históricas. No pedir CONFIRMAR COTI.
5. Iniciar una sola ronda desde el arquitecto con una lista de materiales que corresponda al catálogo y zona La Plata. Verificar: interpretación real, fuente, rubros, ruteo de ambas invitaciones cuando corresponda, dos PDFs con IDs, ambos presupuestos y originales, vista anónima con ítems y condiciones, enlace, cierre y nombres comerciales al cierre. Nunca revelar teléfono del comprador.
6. Detener **la aceptación de nuevos pedidos** si algo falla usando un corte de ingreso que conserve las rondas ya publicadas. **No apagar indiscriminadamente MVP306 si hay una ronda activa:** confirmar_comprador_mvp280 valida todavía el gate de auto-release al acreditar esa ronda, por lo que un apagado prematuro puede inutilizar verificaciones. El gate de prueba del comprador MVP229 controla nuevas rondas, mientras que el derecho del proveedor a responder a una invitación ya enviada está preservado por MVP230. Auditar el caso específico antes de cortar. No reenviar envíos inciertos ni convertir ofertas en revisión a verified manualmente.

## Estado

**Solo desarrollo.** El webhook del piloto sigue v71. MVP333 aún no está publicado; MVP334 no activa nada. Sin prueba completa de punta a punta todavía. No modificar entorno principal, Vercel ni plan Whapi. Integrar en desarrollo solo después de pruebas verdes y evidencia de CI.
