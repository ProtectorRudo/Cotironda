# Decisión 399 — Piloto continuo, sin infraestructura nueva (MVP274)

**06/11/2026. Decisión del propietario:** dejar en **plan B** el ejecutor dedicado, el respaldo ZIP descargable y cualquier servicio que agregue gastos; priorizar que Cotironda funcione realmente con la infraestructura existente. No se autorizó compra ni despliegue en producción. «Sin límite» se interpreta como **sin vencimiento arbitrario de ventana de 90 minutos o 4 horas**, no como gasto, número de mensajes o capacidad técnica ilimitada.

## Estado comprobado de `cotironda-piloto`

Auditoría agregada y **solo lectura** por el conector del proyecto PILOTO el 06/11: PostgreSQL 17.11 activo; Whapi inbound/outbound configurado `true`; 1 comprador y 2 proveedores consentidos, ambos con catálogo; 3 rondas (1 cerrada, 2 preparadas); cola IA Central sin trabajos pendientes/leased/uncertain; 0 intentos de IA Central; flags `ai_trial_control_mvp229`, `ai_central_control_mvp226`, `ai_dispatch_gate_mvp222` **OFF**; 0 usuarios Supabase Auth; 12 módulos del supervisor MVP256–267 pendientes. Las funciones Edge están desplegadas, pero no consta E2E real WhatsApp→PDF→respuesta→ranking/cierre en la versión nueva.

**No hay backup verificado de PostgreSQL + Storage**. Seguir en Free sin garantía de restauración deja riesgo real de pérdida de datos. El propietario pospone el gasto, no autoriza afirmar que dicho riesgo desapareció. El piloto de desarrollo/cerrado puede avanzar con datos ficticios y los participantes de prueba consentidos; **no anunciar a compradores externos un servicio ilimitado ni incorporar datos comerciales de nuevos clientes sin una estrategia de recuperación**.

## Solución MVP274 (solo código de desarrollo; estado OFF)

La restricción original de `ai_trial_control_mvp229` exige vencimiento en un máximo de 4 horas, aunque el caso de prueba requiera días. `supabase/piloto/mvp274_continuous_pilot_optional_off.sql`:

- Extiende el CHECK **sin quitar** la restricción del modo temporal: una fila OFF exige `enabled=false, activated_at=NULL, expires_at=NULL`; una fila ON admite **o bien** `expires_at=NULL` (modo continuo explícito) **o bien** una ventana futura de hasta cuatro horas.
- Actualiza la función de lectura `cotironda_piloto_ia_trial_flags_mvp229(chat_hmac)` basándose exactamente en la continuidad MVP230: `expires_at IS NULL OR expires_at>clock_timestamp()`. No cambia identidad, consentimientos ni autorización de comprador/proveedor; solo tres participantes de piloto permanecen admitidos.
- Mantiene `service_role` como único ejecutor del RPC, no concede grants a `anon` ni a `authenticated`. El modo continuo necesita simultáneamente `ai_central_control_mvp226.enabled`, `ai_dispatch_gate_mvp222.enabled` y `integration_flags.whatsapp_inbound/outbound_enabled` para iniciar rondas o enviar. **Ninguno se enciende automáticamente.**
- La cotización de un proveedor asociada inequívocamente a una invitación efectivamente entregada conserva permiso hasta el cierre de su ronda aun después de apagar la entrada de pedidos, como en MVP230. Los mensajes inciertos nunca se reenvían sin conciliación.
- Las cuotas existentes, límites de archivos y artículos, deduplicación, control de fuentes, presupuesto IA y bloqueo de acciones sin evidencia **no se modifican**. Sin medidor de costos instalado verificado, el piloto no debe presentarse como uso irrestricto de la API.
- Incluye rollback manual `mvp274_rollback_continuous_pilot_off_manual.sql` a la restricción temporal anterior. Falla si hay un modo continuo activado; el operador debe apagarlo primero. No elimina usuarios, ofertas ni fuentes.

## Criterios para una prueba real con gastos controlados

1. Mantener el piloto cerrado a **los tres participantes existentes**; no activar inscripción general, pagos ni envíos por difusión.
2. Verificar código Edge desplegado contra branch, cuotas reales, saldo/tokens, timeout, Whapi y mensajes pendientes, sin usar los costos de un mes como estimación de un solo mensaje.
3. Instalar primero la ampliación **solo si hay consentimiento y autorización de publicación para PILOTO** y una evaluación de pérdida de datos acotada; dejar todo OFF.
4. Probar hasta el cierre: solicitud mixta por WhatsApp, zona si falta, envío del PDF segmentado, ambos proveedores, texto + archivos, copia fiel de IVA/flete y extras, vista por rubro sin identidad y finalistas/cierre, con mensajes reales solo cuando esté explícitamente aprobado. Rechazar rondas mal asociadas, duplicados y gastos inciertos.
5. Se prueba apagar el permiso de comprador y despacho sin cortar presupuestos ya válidamente recibidos. Rehabilitar solo cuando el auditor valide datos y gastos.
6. No quitar topes técnicos a ciegas: el PDF y la cadena de cobertura tienen capacidades reales (25 líneas en ciertas etapas). Ante pedido mayor, **rechazar o pedir dividir**, no recortar materiales ni proclamar soporte ilimitado.
7. El respaldo auténtico externo sigue siendo plan B. Sin restauración verificada el piloto cerrado existe **con riesgo de pérdida de datos**; eso no se traslada de forma silenciosa a clientes comerciales.

## Pruebas y desarrollo

`supabase/tests/ci/mvp274-continuous-pilot-pg17.sql`: PostgreSQL17 transacción con `ROLLBACK`. Verifica OFF inicial, reloj temporal, rechazo de más de cuatro horas, modo continuo prospectivo, comprador y proveedores autorizados, desconocidos/revocados bloqueados, apagado de despacho, continuidad de presupuesto entregado, ACL y rollback de esquema.

**Estado de esta decisión:** construcción y pruebas únicamente en GitHub; no se aplicó SQL a Supabase real, no se activó la prueba, no se publicaron nuevas Edge/Vercel ni se enviaron mensajes.

Fuentes: `docs/351-ia-central-activacion-temporal-piloto.md`, `docs/352-continuidad-presupuestos-tras-ventana-piloto.md`, `docs/223-contrato-piloto-whatsapp-punta-a-punta.md`, `docs/392-preflight-real-piloto-7-etapas-no-go.md`, `docs/60-backup-recovery-free-plan.md`.
