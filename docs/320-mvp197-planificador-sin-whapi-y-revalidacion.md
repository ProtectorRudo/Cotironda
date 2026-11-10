# MVP197 — planificación comprobable con WhatsApp completamente apagado

**Alcance: SOLO desarrollo.** El SQL de MVP196 continúa propuesto pero
**no instalado en cotironda-piloto**. Ninguna bandera de piloto, Edge,
Vercel, WhatsApp ni producción fue activada. Issues #523, #528, #529.

## Bloqueos detectados en auditoría

1. El worker de MVP196, incluso con
   `COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED=false`,
   comprobaba `COTIRONDA_PILOT_WHAPI_TOKEN`, claves de cifrado de
   contactos, canal y `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED=true`
   **ANTES** de consultar cualquier plan. En un piloto seguro con envíos
   apagados devolvía `worker_config_unavailable`, por lo que el modo
   `planned_no_whatsapp` era inalcanzable.
2. El certificado SQL `finalist_source_plans_mvp196` relacionaba
   HMAC/SHA y proveedores, pero el permiso de última instancia
   `source_plan_sendable_mvp196` **no revisaba cambios posteriores**.
   Un consentimiento revocado, presupuesto sustituido o corrección
   textual posterior al plan debía invalidar el permiso inmediatamente.

## Corrección

- Se extrajo a `plan-only-mvp197.ts` la ejecución de la RPC privada
  que obtiene rondas cerradas **posteriores a la activación prospectiva**,
  usa la selección técnica v9 y escribe **solo** planes privados; retorna
  únicamente conteos, jamás nombres ni HMAC/SHA, documentos ni precios.
  La función no importa, configura ni llama a Whapi.
- El worker exige la contraseña del worker y rol servidor PILOTO,
  llama la RPC de cierre seguro existente y el planificador. Si
  `COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED` está OFF devuelve
  `planned_no_whatsapp` **sin buscar** token Whapi, canal, AES/HMAC de
  contactos ni condición de outbound habilitado.
- **Solo** al activar deliberadamente despacho se evalúan la barrera
  `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED`, credenciales, canales,
  consentimientos, colas y envío. La lectura de contactos y el único
  `fetch` a Whapi están después de ambas barreras; los errores
  siguen sin exponer PII ni reintentar indefinidamente.
- Antes de encolar y nuevamente antes de entregar al comprador, el
  selector SQL `source_plan_sendable_mvp196` vuelve a consultar el
  **expediente privado y el pedido**. Verifica identidad del comprador,
  consentimiento actual del proveedor, revisión y texto vigente,
  conjunto HMAC/SHA, unicidad, que no haya cotizaciones posteriores
  dentro del plazo ni versiones de texto que las sustituyan. Devuelve
  FALSE si alguna evidencia deja de ser válida.
- La RPC `commercial_queue_due_mvp196` además filtra por el nuevo
  permiso de fuente vigente. El control del worker antes del último
  intento de Whapi permanece obligatorio, como el de seguimiento
  por token privado.

## Aceptación y pruebas

- Sin Whapi, AES ni outbound, con autorización SQL y worker aislado
  de pruebas, la función plan-only puede devolver conteos
  `planned_no_whatsapp` con 0 envíos. **Esto no prueba que
  cotironda-piloto real ya lo haga:** no se ha instalado su RPC.
- No hay plan si documento v9 caducó, descuentos/total no concilian,
  hay múltiples alternativas sin criterio o un request fue manipulado.
- `already_planned` no aumenta conteos ni vuelve a encolar.
- Una modificación posterior al cierre, una revocación, una nueva
  versión de la cotización o un token de comprador inválido no permiten
  autorizar Whapi ni revelar finalistas.
- PostgreSQL 17: validar SQL propuesto, ACL, RLS, cierre prospectivo
  y helper por defecto OFF con transacción ROLLBACK.
- Deno: typecheck del Edge real, incluida nueva función pura.
- Node: pruebas con RPC simulada, sin secretos ni tráfico real.
- CI completo: unitarios, Next, PostgREST, PG17 y sitio.

## Lo que no queda completado

El planner SQL debe instalarse solo mediante publicación PILOTO
autorizada, realizar una ronda nueva **con consentimiento prospectivo**
y comprobar el cierre, la selección real, la cola y la privacidad
en dos compañías. Continúan pendientes el ranking homogéneo #524,
los originales consentidos #525, el E2E auténtico de WhatsApp y los
controles de costos/reintentos. No tocar `main` ni producción.

Rollback: quitar el código del worker en la rama DEV y, en caso de
futuro despliegue autorizado, desactivar primero flags de despacho
y worker antes de retroceder Edge/SQL; no borrar registros de auditoría.
