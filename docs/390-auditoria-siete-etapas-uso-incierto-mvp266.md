# Decisión 390 — auditoría integral de siete etapas y retención de consumo IA incierto (MVP266)

Fecha: 06/11/2026. Autorización «luz verde»: **solo desarrollo**, sin publicar PILOTO/producción, sin cron, sin WhatsApps y sin consumo de OpenAI real.

## Auditoría de integración: código versus prueba operativa

Estas son las **siete capacidades funcionales de IA Central** definidas en la decisión 380. No confundirlas con el roadmap histórico 00–07.

| Etapa | Evidencia ya integrada en desarrollo | Puerta operativa que sigue abierta |
| --- | --- | --- |
| 1. Motor de decisiones | Doble lectura, citas verificadas, catálogo/rubro y 336 casos sintéticos; consolidación 374, corpus 378 | ≥150 interpretaciones ejecutadas contra el modelo con oráculo humano, métricas de omisiones, latencia, costo y prueba multirrubro con catálogos reales |
| 2. Asociación inteligente | Identidad, invitación acreditada, cita/código de ronda, ledger de ambigüedad (374) | Dos rondas reales simultáneas del mismo proveedor, archivo posterior y aclaraciones, cero atribuciones erróneas |
| 3. Comprensión comercial | Verificación original v9, IVA, extras y flete; imagen/escaneos bajo revisión, OCR externo autorizado por cuotas (375–377) | Fotografías/PDF escaneados reales, consentimiento externo por archivo, cotejo y promoción auditada |
| 4. Comparación por rubro | Cobertura parcial y parejas de hasta dos, Edge→proxy→DOM, sin ranking total falso (378–379) | Vista autorizada en PILOTO y caso real de tres rubros, IVA/flete/stock/marcas con evidencia y revocación |
| 5. Recuperación automática | Errores transitorios/permanentes, reintentos acotados, conciliación Whapi incierta y expediente sin ID (380–382) | Pruebas reales de caídas, confirmación externa y deduplicación sin reenvío |
| 6. Memoria comercial | Aislamiento, TTL, lectura acotada y versionado de correcciones bajo flags OFF (383–385) | Prueba real entre empresas/rondas y correcciones sobre webhook habilitado, sin mezclar precios |
| 7. Supervisor y costos | Snapshot, alertas, cron preparable OFF, tokens medidos, bitácora privada de operador (386–389) | Backend con autenticación humana, revisión de costos monetarios, watchdog/alertas en PILOTO autorizado, mediciones reales y prueba E2E |

**Dictamen:** siete capacidades tienen desarrollo avanzado; **ninguna debe anunciarse como cerrada operativamente solo por CI**. El Issue #597 y el checklist #529 siguen abiertos. La conexión Supabase en esta revisión no estuvo disponible; no se hicieron consultas ni pruebas en base PILOTO. El CI previo de PR #647 informó siete workflows exitosos; eso no sustituye E2E.

## Defecto técnico verificado en MVP264

La reserva de llamadas OpenAI sólo buscaba `reserved/unmetered` con `started_at >= now()-24h`. Una respuesta incierta más antigua podía dejar de bloquear al mismo participante **sin conciliación alguna**. La cuota rotativa (24 llamadas y 200.000 tokens observados) es útil, pero no debe confundirse con autorización para ignorar deudas de medición.

### Corrección MVP266

- El nuevo SQL `supabase/piloto/mvp266_openai_unknown_persistent_review.sql` es un overlay aditivo **posterior a MVP264 y MVP265**, sin modificar el histórico de tokens.
- La función de reserva sigue contando llamadas/tokens de las últimas 24 h, pero comprueba **todas** las reservas pendientes y consumos `unmetered` del participante, sin fecha de caducidad, salvo registro explícito de revisión.
- La tabla de revisiones registra identificador HMAC y número de llamada, operador interno habilitado, fundamento cerrado, SHA de evidencia y hora. Una revisión es única y no edita el ledger original, ni atribuye tokens, moneda o costo cero.
- La RPC privada de revisión exige `service_role`, operador `incident_manager` activo, evidencia SHA y tope de 100 revisiones por operador/24h bajo bloqueo; una reserva aún en vuelo exige al menos 30 minutos desde su inicio.
- `financial_exposure_accepted` permite documentar una **excepción de riesgo**, no un precio/consumo conciliado ni factura confirmada. `provider_usage_reviewed` y `provider_billing_reviewed` sólo atestiguan revisión humana de fuentes externas, no acreditan tokens por sí solas.
- El operador todavía no tiene **autenticación humana conectada**: un UUID de operador no es credencial. Ninguna interfaz ni cliente público puede invocar la RPC a través de un backend no autenticado. La tabla queda vacía por defecto; no se habilitan operadores ni cron en PILOTO.
- El resumen MVP264 continúa mostrando consumos desconocidos aunque se haya documentado la revisión: nunca los pasa a observados.

## Pruebas y criterios de aceptación

- Test PG17 reversible: consumo incierto envejecido 48 h sigue bloqueando; un operador deshabilitado o evidencia inválida no libera; revisión acreditada e idempotente permite otra reserva sin falsificar `unmetered`; la reserva activa reciente no puede liberarse; se mantienen techo de tokens y aislamiento de participantes; RLS/ACL sólo `service_role`.
- Contrato Node: revisión de barreras, ausencia de modificación del ledger original o envío Whapi y no publicación.
- CI general del PR debe quedar verde tras el último commit antes de considerar merge a la rama de desarrollo.
- Las pruebas offline no validan permisos de un operador real, consumo real ni cumplimiento de límites monetarios en USD/ARS; requieren verificación posterior con datos facturados y autorización de entorno.

## Próximas acciones por prioridad

1. Validar el cambio y la integración de las siete suites en GitHub; resolver errores detectados sin tocar PILOTO.
2. Construir un **backend administrativo autenticado** para revisar incidentes y consumos desconocidos, con roles por empresa e historial, antes de exponer acción de revisión; comprobar revocación de sesión y permisos.
3. Preparar evaluación con ≥150 muestras y oráculo humano, uso medido del modelo bajo presupuesto aprobado; no simular resultados.
4. Coordinar una ventana de PILOTO expresamente autorizada para versiones, gates, migraciones, OCR y WhatsApp; conservar respaldo y rollback.
5. Ejecutar E2E real 1→7, incluyendo dos rondas solapadas, tres rubros, proveedores, PDF/Excel/imagen, cierre, portal, fallas de red, conciliación y costos auditables; documentar resultados en #597 y #529.

**Esta decisión no certifica 7/7 ni publica una versión.**
