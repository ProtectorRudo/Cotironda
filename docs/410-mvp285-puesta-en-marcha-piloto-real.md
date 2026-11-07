# Decisión 410 — Puesta en marcha controlada de cotironda-piloto (MVP285)

Fecha: 7/11/2026. Alcance autorizado por «Hacelo así lo pruebo»: **solo cotironda-piloto**, nunca producción. Issue #671, PR #672.

## Estado verificado

- **Supabase piloto PostgreSQL 17.11**, organización Free. No hay backup automático gratuito.
- Se ensayaron **las 21 migraciones MVP245–280 sobre el esquema real**, en una sola transacción, con `ROLLBACK` confirmado. Después se instalaron en una **migración transaccional única**: `piloto_mvp285_integracion_ia_central_21_migraciones_off`.
- Resguardo de contingencia **en el mismo proyecto** mediante `piloto_mvp285_resguardo_privado_pre_publicacion`: 63 tablas, 244 filas, 132 definiciones de funciones y 431 restricciones/triggers; roles `anon`, `authenticated` y `service_role` sin acceso al esquema. **No es backup externo ni restauración verificada**. No incluye archivos binarios de Storage.
- Se aplicó `piloto_mvp285_operador_revision_comprador_off`: tabla de operador privada con RLS y solo service_role puede consultar su función; la tabla arranca **OFF**. Se verificaron ACL y estado.
- La Edge Function `cotironda-piloto-whapi` pasó primero a v55 con el código IA Central y luego a **v56 ACTIVE** y finalmente a **v57 ACTIVE** tras bloquear el fallback documental antiguo para compradores con IA Central activa. Se comprobó el código de confirmación exacta y el manejo de Whapi API sin ID (`uncertain` terminal, jamás reenvío automático).
- Se ejecutó activación con `BEGIN/ROLLBACK` y comprobación real de `trial_flags` comprador + operador; después la activación efectiva quedó **ON** para comprador `arquitecto` y proveedores `corralon_ailin` / `corralon_nahuel`. Los tres conservan consentimiento válido. **No se envió ningún WhatsApp durante instalación o activación.**
- `ai_trial_control_mvp229`: `enabled=true`, `activated_at` registrado, `expires_at=NULL` (**piloto continuo sin ventana de 90 minutos**). IA Central, puerta de despacho y autorización operador ON, cuotas de uso/costos, deduplicación y control de permisos intactos.
- Las dos cuentas proveedor tienen 53 artículos de catálogo cada una, incluyendo entradas de cemento y arena. No se inventan stock, precios ni confirmaciones comerciales.
- Antes de activar, había **0 mensajes outbox pendientes**, **0 despachos IA inciertos** y **3 crons históricos** activos. No se crearon crons ni se reenviaron las cinco aceptaciones antiguas sin prueba de entrega.
- La base tenía **74 registros de migración** después de aplicar resguardo, paquete de 21 y operador, sobre 71 históricos.

## Conmutador independiente sin secretos nuevos

La nueva RPC `cotironda_piloto_ia_review_launch_mvp285(text)` es servicio-only y sólo autoriza `send`, `confirm` y `release` si:
1. El HMAC corresponde al **comprador** autorizado y consentido, nunca a un proveedor o desconocido.
2. La prueba continúa activa mediante SQL y la autorización de IA Central.
3. El despacho está habilitado.
4. La nueva puerta administrativa `ai_review_launch_mvp285` está explícitamente activada.

Edge exige esos cuatro controles y deja `OFF` las tres acciones si falta alguno. Una variable `COTIRONDA_PILOT_BUYER_REVIEW_*_ENABLED=false` explícita en Edge aún bloquea su acción; **si está ausente**, el operador SQL puede autorizar sin solicitar nuevas credenciales. El estado de esas variables de entorno no fue visible por la conexión actual, por lo cual debe verificarse con prueba real.

## Prueba a efectuar por el comprador registrado

Enviar **un mensaje nuevo**, no un reenvío viejo:

> Hola, necesito cotizar 20 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.

Verificar respuesta completa por WhatsApp con la localidad, todos los materiales, cantidades y el código `CONFIRMAR COTI ...`. Confirmar sólo si la lista es correcta. Una vez confirmada, verificar que cada proveedor reciba **una única solicitud PDF** con su rubro, que contesten citando el PDF original (texto, PDF o Excel) y que el comprador abra su enlace privado de seguimiento y vea ofertas anónimas por rubro, sin comparar totales de coberturas distintas. Verificar cierre posterior y notificaciones por separado.

**No afirmar E2E real PASS antes de observar ese recorrido por WhatsApp, IA/OpenAI, navegador y comprobantes de entrega.** La compilación GitHub y la creación de un Edge activo no prueban conectividad real, credenciales de IA/Whapi ni banderas explícitas que pudieran vetar la operación. Distinguir `api_accepted` de entrega final.

## Apagado inmediato (sin tocar solicitudes anteriores)

La reversión operativa de nuevos pedidos es la **desactivación transaccional** de las cuatro puertas:
```sql
BEGIN;
UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
 SET enabled=false,activated_at=NULL WHERE only_row;
UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=false,activated_at=NULL,expires_at=NULL WHERE only_row;
UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=false,activated_at=NULL WHERE only_row;
UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=false,activated_at=NULL WHERE only_row;
COMMIT;
```

La desactivación corta **nuevos envíos**, pero conforme MVP230 las respuestas de rondas ya enviadas pueden continuar hasta su vencimiento. No reencolar mensajes inciertos, ni inventar IDs de Whapi. El resguardo interno no alcanza para restauración completa si cae el proyecto.

## Pendientes y riesgos conocidos

- Confirmar funcionamiento real de credenciales y variables de entorno con un WhatsApp nuevo. Los resultados completos y consumo de OpenAI sólo se conocen al ejecutar el recorrido.
- El sistema mantiene cuotas y límites económicos; **sin caducidad no equivale a consumo monetario ilimitado**. La allowlist real sigue siendo dos proveedores, ampliable sólo con consentimiento.
- Publicación de nuevas vistas/seguimiento en Vercel no está acreditada por la activación de Edge: puede haber previews automáticas `READY` y checks `build-rate-limit`. Validar URL de seguimiento con token privado sin exponerlo.
- **Respaldo completo fuera de Supabase y restauración verificada pendientes**; el pago por backups sigue como Plan B, sin gastos nuevos.
- No se modificó producción ni se habilitaron cron/supervisor nuevos.

## Evidencia

Scripts y CI: `supabase/piloto/mvp285_resguardo_interno_pre_publicacion.sql`, `supabase/piloto/mvp285_piloto_revision_operador_sql_gate.sql`, `supabase/tests/ci/mvp285-operator-gates-pg17.sql`, `scripts/piloto/mvp285-operator-gate-builder.mjs`, y workflow `cotironda-mvp285-pilot-operator-gates.yml`.

## Endurecimiento posterior MVP285 / v57

Para el comprador que tenga IA Central activa, un documento no contemplado por las rutas verificadas (PDF, Word, Excel o TXT/CSV, según configuración) **jamás** debe caer en el preparador documental antiguo de invitaciones automáticas, ni siquiera si la variable de entorno `COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED` no está configurada. Se cambió el `else if` de `index.ts` para bloquear el fallback con `centralConfigured || ...`, con regresión en `tests/unit/mvp285-operator-review-gates.test.mjs`. La función **v57 ACTIVE** ya contiene este guard. No se generaron invitaciones durante el despliegue.
