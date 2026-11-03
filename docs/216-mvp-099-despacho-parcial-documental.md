# MVP-099 — Despacho documental con subconjuntos por proveedor

Fecha: 02/11/2026. Issue #408. Rama `feat/mvp-099-despacho-parcial-documental`. **Solo Supabase Piloto. No producción.**

## Problema que resuelve
El esquema anterior admitía una invitación por proveedor pero el PDF enviaba siempre **toda la solicitud**. Además, el permiso del envío piloto solo contemplaba `cemento_gris_obra` e `hidrofugo`, exigiendo que cada proveedor vendiera todos los materiales. No sirve para pedidos mixtos ni cotizaciones parciales.

## Flujo nuevo (sin aprobación por cada ítem)
1. Se recibe por Whapi una imagen/PDF/Excel/Word original. Se descarga y conserva privado con huella SHA256, fecha y emisor consentido, como en MVP-095.
2. La IA hace **dos lecturas separadas** de los mismos bytes, con perspectivas primaria y de corroboración, en paralelo. El resultado primario se conserva como borrador privado. Una RPC exige concordancia estricta de **cantidad, unidad, descripción, número y orden de todos los renglones, ciudad, nota de entrega y citas de evidencia**. No interpreta marcas inexistentes ni infiere unidades. Esto **reduce** el riesgo de lectura, pero NO prueba matemáticamente fidelidad al original: dos modelos pueden coincidir en el mismo error. Ningún importe de proveedor se verifica con este paso.
3. Un documento de comprador con consenso queda en ledger `document_agreements_mvp099`. Si faltan localidad, unidades o una familia inequívoca, **no se genera una ronda**. El sistema sigue el contexto: para localidad, pregunta una vez y puede continuar sin reanalizar archivos. No se descarta el original.
4. Cuando todos los ítems del comprador son explícitos y tienen cobertura entre los proveedores del piloto, la RPC privada `cotironda_piloto_prepare_document_mvp099` crea **una solicitud con TODOS sus renglones**, asociada de forma inmutable al original por `source_hmac` y `content_sha256`, un plazo de 4 días, e invitaciones a negocios con categorías declaradas y consentimiento vigente.
5. `invitation_lines_mvp099` marca cada material que el proveedor puede cotizar por categoría; `refresh_partial_invite_mvp099` cambia **atómicamente** el texto de cada invitación por su subconjunto. El PDF `cotironda_piloto_pdf_snapshot_mvp091` filtra esos mismos artículos para ese proveedor. El artículo sigue visible en la solicitud global, aunque otro negocio no lo ofrezca. El catálogo declarado es una opción de invitación, **no una declaración de stock ni precio**.
6. `allow_document_send_mvp099` y el `claim_whapi`/ `authorize_whapi` revalidan original, consentimiento del comprador y proveedor, catálogo/zona, plazo, entrega La Plata, identidad dentro del piloto y documentación acordada **al reclamar y justo antes del HTTP**. El antiguo gate MVP-091 sigue válido para rondas de prueba anteriores. Continúa el ledger de leasing/resultado incierto: sin reenvíos ciegos.
7. Si un comprador responde la localidad que faltaba, `attach_zone_to_document_mvp097` devuelve exclusivamente al backend autenticado el HMAC de su **único** documento pendiente, y el receptor intenta promoverlo sin tercera llamada a OpenAI. No añade una solicitud nueva a partir de una simple localidad.

## Controles / delimitaciones
- Solo los dos proveedores explícitamente enrolados del piloto, `corralon_ailin` y `corralon_nahuel`. No ampliar la lista automática, ni guardar teléfonos abiertos, ni enviar a supuestos proveedores. La zona admitida por este piloto es La Plata.
- **No hay envíos a proveedores con la imagen real de 10 Cemento / 2 Arena / 288 Huecos del 12**, porque faltan unidades, especificación de arena y localidad. No inventamos bolsas, m³ ni unidades.
- `requests.original_request` en ronda documental es **transcripción estructurada y referencia SHA256**, **NO** los bytes originales. Los bytes auténticos permanecen en bucket privado.
- Si un artículo no tiene cobertura en el catálogo del piloto, no se descarta ni se anuncia como cotizado: se mantiene pendiente hasta soportar comunicación de cobertura incompleta al comprador. Es preferible no enviar una solicitud mutilada.
- PDFs a proveedor: hasta 8 renglones por piloto por limitación del generador actual, no es un límite comercial del producto futuro; rechaza casos inválidos en lugar de truncarlos.
- El segundo análisis consume una llamada OpenAI adicional por documento (dentro del presupuesto del piloto). La recepción de archivos con salida parcial conserva original y no reintenta llamadas inciertas.
- El cierre, ranking objetivo de artículos y revelación de hasta dos ganadores **NO** quedan validados E2E por este cambio. Las cotizaciones PDF del proveedor siguen en `awaiting_fidelity_check`: deberán compararse fielmente antes de ranking.

## Pruebas y criterios de aceptación
- `mvp099_smoke_rollback.sql`: datos ficticios en PostgreSQL 17 Piloto, eliminando momentáneamente en transacción una familia del catálogo del segundo negocio. Verifica **dos proveedores con subconjuntos distintos (2/1 ítems), dos filas globales inalteradas, texto filtrado, PDF específico, lease+recheck, revocación de consentimiento, una sola ronda por archivo, rechazo de una cantidad discrepante entre lecturas, RLS y ROLLBACK total**. No manda WhatsApp ni crea datos persistentes de prueba.
- `tests/unit/mvp099-despacho-por-proveedor.test.mjs`: cobertura de entradas y guardas de envío del receptor, PDF y RPCs.
- CI GitHub 6/6 y SQL smoke después de migraciones antes de desplegar Edge en **PILOTO**.
- No concluir que el flujo completo de oferta–ranking–finalistas está terminado sin ensayo WhatsApp real con presupuesto de proveedor y cierre.

## Pendientes inmediatos
- Verificar respuesta exacta de una lectura de imagen completa y tiempos de dos llamadas antes del primer despacho comercial real.
- En el documento incompleto, preguntar **todos los datos vitales faltantes en una sola conversación** y asociarlos al borrador sin exigir reenvío. MVP-097 cubre localidad, todavía no especificación por línea.
- Incorporar al comprador seguimiento privado para solicitudes documentales, con cobertura y estado de cada proveedor.
- Confirmar categorías reales con proveedores, gestionar reintentos idempotentes y costos globales. Ampliar rubros y proveedores sin catálogos predeterminados ni supuestos de inventario.
- Convertir presupuestos proveedor (imagen/PDF/Excel) en cotizaciones verificadas línea por línea, IVA/flete/extras/totales literales, ranking justo y hasta 2 finalistas al cierre.
