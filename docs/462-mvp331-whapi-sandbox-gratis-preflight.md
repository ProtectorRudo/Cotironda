# Decisión 462 — Whapi Sandbox gratuito y preflight para prueba real

**Fecha:** 09/11/2026 (Argentina). **Alcance:** investigación oficial, lectura de Supabase y desarrollo de comprobador aislado. Sin activar mensajes, editar Whapi, desplegar piloto ni costos.

## Investigación confirmada

Whapi.Cloud ofrece un plan Developer Sandbox gratuito y permanente, independiente de su trial de cinco días. Restricciones actuales anunciadas: 5 chats activos/mes, 150 mensajes/día, 30 verificaciones de números/día y 1000 API requests/mes. Fuentes: https://whapi.cloud/price y https://support.whapi.cloud/help-desk/getting-started/getting-started

Estados de un canal Whapi: AUTH operativo, STOP detenido (fin de prueba, desactivación, facturación o falla), QR requiere reconexión, INIT/LAUNCH transitorios, SYNC_ERROR afecta la sincronización. Documentación: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/account-and-device-status

La API oficial permite consultar GET /health?wakeup=false. IMPORTANTE: si se omite wakeup, su valor por defecto es true y puede iniciar el canal. También existen GET /settings, para revisar URL/modo/eventos de webhook, y GET /limits, para uso del canal. Ver https://whapi.readme.io/reference/checkhealth , https://whapi.readme.io/reference/getchannelsettings y https://whapi.readme.io/reference/getlimits .

Con tres chats del piloto (comprador, Ailín y Nahuel) se puede usar Sandbox siempre que pertenezcan al cupo y la sesión esté habilitada. No inferir que un canal del usuario esté en AUTH por el simple hecho de que el plan gratuito exista. El panel puede exigir seleccionar Sandbox o reanudar canal luego del trial; si no hay opción, consultar soporte sin contratar Premium.

## Estado real del piloto, auditoría 09/11

Proyecto cotironda-piloto, id ilggkalaafhtiysyzlmg, PostgreSQL 17:
- Edge cotironda-piloto-whapi ACTIVE v70; seguimiento ACTIVE v27; batch ACTIVE v1.
- Gate de liberación autónoma MVP306: OFF. Batch MVP314: OFF. Aviso comprador MVP315: OFF. Gate heredado de despacho MVP222: ON; no implica activar nueva ruta.
- Tres participantes registrados, 5 rondas, 30 entradas históricas en whapi_inbox y 1 en últimas 48 h. 0 revisiones de proveedores económicamente verificadas y 1 en revisión.
- Las migraciones de custodia MVP328/MVP329 siguen sin instalarse. No se ha comprobado actual Whapi AUTH, cupo, token o configuración remota del webhook.
- Webhook v70 mantiene ruta heredada y aún no integra toda la ruta autónoma MVP311–315; el worker aislado no equivale a un circuito activo.
- El token Whapi histórico se expuso en una captura. Debe rotarse y actualizarse en secreto protegido antes de habilitar salidas. No pedir ni compartir token en chat o GitHub.

## Implementación MVP331

Herramienta Node22 scripts/piloto/mvp331-whapi-sandbox-preflight.mjs. Lee credenciales solo desde variables locales y permite inyectar cliente HTTP en las pruebas. Realiza como máximo tres solicitudes GET con timeout, cero reintentos y sin seguir redirecciones: health?wakeup=false, settings y limits. Exige canal AUTH e id exacto; webhook hacia https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi con modo body y evento de mensajes POST; cuenta chats sin imprimir números ni IDs; no presupone si los indicadores numéricos son consumo o remanente. No devuelve contenidos sensibles ni activa nada. Siempre marca mensajes enviados 0, cambios realizados 0, habilitarCotironda false, pruebaCompletaAcreditada false.

Variables locales necesarias: COTIRONDA_PILOT_WHAPI_TOKEN y COTIRONDA_PILOT_WHAPI_CHANNEL, con valores secretos protegidos. Comando desde raíz: node scripts/piloto/mvp331-whapi-sandbox-preflight.mjs . No pasar variables sensibles a GitHub Actions ni usar el token expuesto anteriormente.

Pruebas unitarias sintéticas comprueban AUTH, STOP, QR, canal ajeno, webhook mal configurado, error 401, plan 402, cuota 429, errores de red, sin token, chats 5/6, respuesta inválida y no filtración de números ni tokens. CI dedicado solo mocks, sin Whapi ni Supabase real.

## Protocolo posterior para validar E2E

1. El responsable abre https://panel.whapi.cloud, selecciona canal Cotironda, confirma modo gratuito Sandbox y estado AUTH. Si está STOP, revisar cambio de modo o contactar soporte. Si aparece QR, religa desde Dispositivos vinculados en WhatsApp. No pagar. Rotar el token mostrado previamente; mantenerlo fuera del chat.
2. Ejecutar preflight y confirmar que el webhook y el cupo permiten exactamente los chats de prueba. Inspeccionar las credenciales protegidas de Edge sin revelarlas y confirmar allowlist de los 2 proveedores.
3. Completar integración del webhook prospectivo, pruebas PG17/Node/Edge y controles contra duplicados, fugas de comprador y presupuestos sin evidencia. No habilitar flags antes de autorización de despliegue del piloto.
4. Bajo orden de publicación para PILOTO, desplegar y activar solo una ronda con tres participantes ya vinculados. Verificar aceptación Whapi y no confundirla con entrega.
5. E2E real: comprador manda texto o archivo con zona; IA extrae rubros y destinatarios; proveedores reciben pedido, contestan texto/PDF/Excel; Cotironda muestra renglones y totales acreditados de modo anónimo; cierra al plazo y revela todos los comercios invitados según reglas de contacto comercial, nunca el contacto del comprador.
6. Documentar resultado paso a paso; ante error/timeout detener y analizar sin reenviar WhatsApp a ciegas ni gastar IA para repetir un mismo original.

**MVP331 no acredita funcionamiento del canal del usuario ni hace prueba E2E.** Fuente de verdad: GitHub. No tocar producción ni cobrar un plan. Sin backup restaurable real comprobado.
