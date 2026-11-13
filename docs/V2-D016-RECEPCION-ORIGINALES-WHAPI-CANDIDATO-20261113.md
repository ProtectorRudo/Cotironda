# Cotironda V2 D016 — recepción de presupuestos y baja por WhatsApp (P0 #838)

**13/11/2026 · CANDIDATO, NO PUBLICADO**. Sigue la arquitectura V2 y complementa [PR #840](https://github.com/ProtectorRudo/Cotironda/pull/840): salida de PDF con aviso en el mismo WhatsApp, registro privado de evidencia, aceptación de presupuesto original sin pasos adicionales y posibilidad de solicitar **NO COMPARTIR**.

## Qué hace

- El webhook *firmado* guarda primero el texto o documento en \`whapi_inbox\`; los documentos/Excel/Word/PDF/imágenes deben tener \`media_archive_mvp095.state='stored'\`, SHA y ruta corroborados. Después, el módulo \`original-reply-intake-d016.ts\` intenta registrar evidencia de procedencia, nunca autorización legal de cesión.
- Nueva RPC privada \`record_reply_event_private\`: obtiene ronda y proveedor directamente de \`whapi_inbox\` + \`ai_supplier_links_mvp225\` + ledger de aviso. Comprueba la misma identidad/chat, asociación \`quoted_whapi_id\` al mensaje de salida o una única ronda activa, y delega al guard de verificación SHA y revocación. Devuelve sólo \`verified_reply_not_authorization\` o \`denied\`; ningún precio, nombre, archivo ni contacto.
- Sólo permite asociaciones \`quoted_whapi_id\` y \`single_active_round\`. La asociación semántica \`semantic_unique_mvp291\` queda fuera hasta contar con una prueba suficiente para distinguir varias rondas. No relajar criterios para «hacer pasar» tests.
- Nueva RPC \`revoke_by_whapi_text_private\`: sólo reconoce el SHA real de texto en \`whapi_inbox\` correspondiente al comando exacto «NO COMPARTIR» (con variantes concretas de minúsculas/punto), desde el mismo canal y proveedor que recibió aviso. Revoca todos los avisos pendientes o completados de ese proveedor, sin exigir un número de ronda. Un texto arbitrario, otro proveedor/chat y un evento duplicado no crean revocaciones.
- Overlay \`v2-d016-original-inbox-overlay.mjs\` genera una **copia temporal** de Whapi v76 + V2-02 + D016 salida/portal/entrada. El webhook histórico y despachador MVP223 protegido no se modifican. La opción \`COTIRONDA_PILOT_D016_ORIGINAL_INBOX_ENABLED\` arranca OFF, además de las tres políticas SQL comerciales OFF.
- No envía un WhatsApp de confirmación, no abre sesiones ni devuelve originales. No genera costo de IA.

## Puntos que deben revisarse antes de publicar Edge

1. **Juridicidad**: evidencia de respuesta no implica necesariamente consentimiento expreso/documentado para divulgar datos de una persona (Ley 25.326, arts. 5/11). El acceso del arquitecto a archivos originales sigue bloqueado hasta revisión jurídica y autorización por solicitud/proveedor.
2. **Correlación real**: verificar que \`ai_supplier_links_mvp225\` y \`whapi_inbox.request_id\` sean persistidos correctamente también para PDF, Excel y Word y para cualquier texto con precio, y que los distintos estados del flujo no eliminen un vínculo válido. Si no, dejar pendiente y revisar; **nunca inventar ronda**.
3. **Retransmisión**: un webhook 503 puede ser reenviado; SQL conserva idempotencia por \`message_hmac\`. No repetir mensajes salientes ni crear documentación falsa. Los errores registrados requieren conciliación.
4. **Reenvíos**: el adaptador intenta detectar metadatos \`forwarded\`/ \`is_forwarded\` / \`context.forwarded\`; el formato exacto debe confirmarse con Whapi antes de confiar en ausencia de marca. Aun con evidencia, no publicar original.
5. **Privacidad**: no tocar el flujo de compradores, no publicar identificadores de empresas, no inferir IVA/flete/precios y no debilitar controles de originales del SQL histórico.
6. **Infraestructura**: evaluar instalación sólo de RPC privadas tras Node/Deno/PG17 y auditoría. Ni siquiera después de instalar se habilitan los flags o se envía WhatsApp hasta prueba completa.

## Pruebas de aceptación

- \`tests/unit/v2-d016-original-inbox.test.mjs\`: flag OFF, no proveedor, no remitente firmado, replay, reenvío, cuerpo «NO COMPARTIR», documentos sin archivo almacenado, callback y resultado SQL.
- \`supabase/tests/ci/v2-d016-original-inbox-pg17.sql\`: BEGIN/ROLLBACK sintético, cotejo Whapi, diferente proveedor, ID citado distinto, reenvío, cotización falsa, texto, archivo SHA, duplicación, opt-out exacto y ACL sin acceso anon/auth.
- CI genera copia temporal de Whapi v76 y ejecuta \`deno check\` del candidato completo. Si falla, corregir sin parchear el original.

**Siguiente prueba necesaria antes de considerar el piloto al 100 %:** pedido auténtico desde WhatsApp → envío a los negocios según catálogo PRODUCTO → PDF/cotización auténtica por Whapi → vínculo único en base → originales solo con permiso válido → acceso privado comprador → análisis breve → informe final al vencer plazo. No cerrar sin E2E.

**Referencias:** [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) y [plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
