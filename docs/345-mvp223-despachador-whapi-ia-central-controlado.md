> **Actualización ADR 346 (05/11/2026):** la confirmación formal de catálogo ya NO es requisito para **invitar a cotizar** a un proveedor con consentimiento y productos registrados. Se conserva la marca real `catalogue_confirmed_at` sin inventarla y se siguen validando identidad, zona, existencia de la línea y cambios de precios. Ver [docs/346](346-mvp224-invitaciones-con-catalogo-registrado-sin-friccion.md). La restricción anterior en este documento queda sustituida solo para invitaciones.

# MVP223 — despachador IA Central protegido detrás de dos barreras

**Fecha** 2026-11-05. **Estado:** código para DESARROLLO, no publicado
en Supabase; WhatsApp de PILOTO y producción intactos.

## Qué resuelve

Antes de esta fase, MVP222 ya creaba trabajos por proveedor y snapshots
PDF correctos en SQL, pero no había transporte de Whapi.

`ai-central-dispatch-mvp223.ts` ejecuta la cola sin decidir por sí
mismo qué corresponde enviar. Por cada trabajo:
1. reclama un lease `cotironda_piloto_ia_claim_mvp222` para una ronda;
2. verifica que el proveedor esté en la allowlist de Whapi y que el
   HMAC de su número coincida con el del participante verificado;
3. obtiene `cotironda_piloto_ia_pdf_snapshot_mvp222` por lease,
   rechaza mezcla de rondas, unidades inválidas, texto sin fuente,
   más de 25 líneas y PDFs fuera de tamaño;
4. reutiliza el generador PDF privado existente
   `generarSolicitudPdfMvp091` y envía SOLO a esa allowlist,
   no al teléfono que pueda escribir la IA;
5. registra `api_accepted` (aceptación por API, NO leído) o
   `uncertain` (timeout, error, destino o PDF inválido). Una segunda
   llamada no reintenta lo incierto;
6. si falla el registro definitivo de estado, informa
   `requiere_conciliacion` y no intenta otro envío.

## Conexión con webhook

`index.ts` solo intenta este módulo si:
- es un webhook Whapi con cabecera autenticada y canal correcto,
  y contiene mensaje de texto válido;
- `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED=true`;
- `COTIRONDA_PILOT_AI_CENTRAL_DISPATCH_ENABLED=true` (NUEVO,
  **desactivado por defecto**);
- el RPC `cotironda_piloto_ia_ready_for_chat_mvp223` devuelve EXACTAMENTE
  una ronda preparada con trabajos pending del MISMO comprador,
  consentido, fuente enlazada por HMAC e integridad SHA, creada
  en la ventana de 30 minutos;
- `cotironda_piloto_privado.ai_dispatch_gate_mvp222.enabled=true`
  y el transporte SQL también está habilitado.
- El broker limita a 2 trabajos por webhook firmado; futuramente
  debe existir un trabajador durable/cron para proyectos de más proveedores.

La nueva RPC es `SECURITY DEFINER`, solo accesible por
`service_role` y sin PII ni originales. Devuelve `empty` cuando
no hay pedidos nuevos; `ambiguous` si hay más de una ronda pendiente,
y NO elige una arbitrariamente.

## Pruebas

`tests/unit/mvp223-whapi-ia-central-despacho.test.mjs`:
apagado, 2 proveedores, tercer proveedor tras otra llamada,
HMAC incorrecto, PDF vacío/ronda ajena, Whapi acepta sin ID,
fallo al registrar status y respuesta RPC falsa.

`supabase/tests/ci/mvp223-ia-webhook-despacho-pg17.sql`:
roles sintéticos, fuente de WhatsApp con HMAC/sha, consulta desde
comprador autorizado, rechazo desde comprador ajeno, gate OFF,
3 trabajos terminales y 0 reenvíos; todo bajo ROLLBACK.

## No afirmar que completó E2E

- El nuevo webhook todavía NO llama automáticamente al planificador
  IA de MVP220: sigue existiendo el lector heredado v47.
  Primero se necesita cola durable de interpretación, cuotas y
  conciliación del mensaje original, con bandera OFF.
- Ambos catálogos pilotos tienen 53 líneas, pero estado de
  confirmación sin acreditar. No declarar una aceptación ficticia.
- La asociación de respuesta citada por Whapi debe consultar
  también `ai_dispatch_jobs_mvp222.whapi_message_id`.
- Faltan ranking económico por rubro, cierre, contactos, originales
  y pruebas reales de transporte/recepción.
- No ampliar por accidente la allowlist de dos proveedores ni
  habilitar production. Issues #597 y #529 siguen abiertos.

**Nota:** el código de despacho sin el habilitador SQL y Edge
permanece apagado; instalar una migración no envía WhatsApps.
