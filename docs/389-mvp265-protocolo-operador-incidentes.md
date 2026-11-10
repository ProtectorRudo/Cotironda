# Decisión 389 — Etapa 7: atención privada de incidentes, sin acciones comerciales (MVP265)

Fecha 06/11/2026. Aprobación «Luz verde»: trabajar en desarrollo, sin publicar ni activar PILOTO o producción.

## Propósito

MVP263 detecta siete señales de alerta, cuenta observaciones y detecta resolución/reapertura. Pero un contador no indica si alguien investigó el problema, quién debía intervenir, ni cómo documentar la evidencia. MVP265 suma una **bitácora operativa privada**, sin reemplazar el motor de señales y sin permitir que un operador declare «resuelto» un incidente activo.

## Contrato de incidentes

- `supervisor_operators_mvp265`: registro interno de operadores con UUID, rol `incident_manager` y `active=false` por defecto. **Ningún operador se inscribe automáticamente al instalar**. No hay contraseña, token ni cliente público asociado.
- `supervisor_case_events_mvp265`: bitácora append-only por señal + **episodio** (`first_seen_at` vigente de la alerta). Guarda solo código de acción, UUID de operador habilitado, SHA256 de evidencia y marca temporal. Nunca guarda contenido del chat, teléfonos, nombres, precios, tokens privados ni archivos originales. Repetir exactamente la misma evidencia y acción produce `already_recorded`, no duplicación.
- `cotironda_piloto_supervisor_case_action_mvp265`: para un episodio vigente, exige operador previamente habilitado; controla hasta **200 registros por operador/24h**, transición y estado real de alerta bajo bloqueo `FOR UPDATE`. Un incidente activo **solo admite** `acknowledge`, después `investigate`, `escalate` o `manual_reconciliation_needed`. `review_resolution` solo se registra **después de que el supervisor constate que la señal desapareció**. Ninguna acción modifica `supervisor_alerts_mvp263` o un ledger de WhatsApp.
- `cotironda_piloto_supervisor_case_queue_mvp265`: salida agregada por señal, sin datos privados. Distingue gravedad `blocked` o `attention`, número de incidencias, minutos sin atención, estado de revisión y umbral de atención. No envía notificaciones, no solicita datos de contacto ni puede actuar sobre precios.
- **SLA orientativo (no promesa de respuesta automática):** 30 minutos para `blocked` (WhatsApp incierto, lease detenido, documento permanentemente fallido); 120 minutos para `attention` (presupuestos en revisión, reserva envejecida, reintento documental permitido y expedientes sin nota). Se muestra `unacknowledged_over_sla` cuando sigue activo sin constar el primer acuse.
- La proyección no elimina el historial anterior si la misma señal reaparece. Una reapertura lleva nuevo `first_seen_at`, exige **nuevo `acknowledge`** y rechaza acciones enviadas con la fecha del episodio antiguo.

## Seguridad de autenticación

Las RPC son `SECURITY DEFINER SET search_path=''`, `EXECUTE` exclusivo a `service_role`, tablas privadas con RLS y grants directos denegados. **Un UUID de operador NO es autenticación por sí solo.** Antes de pasar `operator_ref` a una RPC, un backend administrativo (todavía no desarrollado) debe autenticar de forma independiente al operador humano, validar su autorización y registrar acceso. Este PR no abre una consola administrativa, no permite que el comprador/proveedor envíe `operator_ref` ni registra operadores de producción. La prueba solo inscribe actores sintéticos en una base transaccional que se revierte.

## Procedimiento operativo recomendado

1. Leer `cotironda_piloto_supervisor_case_queue_mvp265()` en el contexto privado de un operador autorizado. Priorizar `blocked`, las alertas más antiguas y la falta de acuse por encima del SLA.
2. Para `outbound_uncertain`: comprobar primero el ID Whapi persistido y los recibos autenticados MVP257. Si falta ID, abrir/consultar el expediente MVP258. **Nunca reenviar** por timeout ni marcar entrega por una nota.
3. Para `outbound_stalled_lease`: comprobar origen, cuota, período de despacho e idempotencia. El operador deja evidencia, pero no libera el lease a ciegas.
4. Para `document_manual_review`: revisar fuente, integridad y tipo de error. No reintentar permanentemente una credencial ausente, documento inválido o contenido comercial no verificable.
5. Para `supplier_quotes_review` y `supplier_quotes_stale_reservation`: cotejar presupuesto original y última versión comercial, evitando revelar contactos o completar productos no pedidos.
6. Registrar `acknowledge`, `investigate` o `escalate` con SHA256 de evidencia retenida en el repositorio/procedimiento autorizado. El hash identifica evidencia; **no prueba su veracidad** por sí solo.
7. El Supervisor determina la resolución por datos fuente. Solo entonces registrar `review_resolution`. Si reaparece la alerta, atenderla como episodio nuevo, sin copiar el acuse del anterior.

## Auditoría y pruebas

- SQL PG17 reversible con un alerta activa; negativa de operador deshabilitado; no elevar sin acuse; una nota duplicada no multiplica filas; el operador no puede resolver señal activa; prioridad/SLA; estado actualizado cuando el supervisor observa que se corrigió el origen; reapertura con episodio distinto y prohibición de enviar acciones a un episodio antiguo.
- Tests de contrato Node: sin INSERT de operadores en migración, bitácora, RLS/ACL, transición, no PII, no WhatsApp y no escritura sobre la tabla real de alertas.
- GitHub CI general y fusión solo a rama de desarrollo tras controles verdes.

## Lo que sigue faltando

No hay todavía interfaz administrativa con autenticación humana, conectores de alertas externas o pruebas operativas con incidentes reales. Tampoco se han conciliado facturas/costos de OpenAI, Whapi, OCR y Supabase. Esas áreas requieren permisos y mediciones verificables, nunca un precio supuesto. MVP265 **no cierra por sí solo** la etapa 7 operativa ni cambia el estado del piloto.
