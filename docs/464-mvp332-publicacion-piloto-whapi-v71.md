# Acta 464 — publicación controlada real del webhook Whapi v71

**Fecha:** 09/11/2026 ART. **Orden:** «Publicalo», sobre el avance MVP332 destinado a `cotironda-piloto`. **Proyecto exclusivo:** Supabase `ilggkalaafhtiysyzlmg`; sin producción, otros proyectos, Whapi, Vercel ni planes pagos.

## Fuentes y alcance aprobado

- GitHub [PR #734](https://github.com/ProtectorRudo/Cotironda/pull/734), merge de desarrollo `b48fc4fd76098a8a69e4982a1d9365a69786a1ba`, documento [463](463-mvp332-piloto-e2e-bundle-whapi-preparacion.md).
- Edge existente `cotironda-piloto-whapi`: v70 ACTIVE, `verify_jwt=false`, **60 archivos**.
- Preflight de despliegue: `ezbr_sha256=f1ffef899e8ce50cac37d667d3df51511a0de8293108501109a14b0c7e891876`; comparados **60/60 hashes SHA256** activos y **4/4** hashes de las únicas fuentes nuevas/modificadas con manifiesto GitHub. Había cero jobs `pending/leased/uncertain` y cero salidas `leased/uncertain`; controles MVP306, MVP314 y MVP315 apagados. No había drift.
- **Despliegue realizado:** se reemplazó la Edge **solo en piloto**, quedó `v71 ACTIVE`, **61 archivos**, mismo `verify_jwt=false` y autenticación por clave interna del webhook. No se cambiaron secrets, token, Whapi, scheduler, Vercel ni otras Edge. **Postcheck hash completo 61/61 aprobado**.
- Se preservaron `cotironda-piloto-seguimiento` v27 y `cotironda-piloto-ai-batch` v1, así como 3 participantes y 5 rondas. No se dispararon nuevos WhatsApps ni modelos durante el despliegue.

## Consentimientos previos declarados por el responsable

En conversaciones del 07/11 el titular declaró haber recibido personalmente las autorizaciones de los participantes ya incorporados. Conforme a la orden `Publicalo`, se utilizó **solo** `cotironda_piloto_privado.admin_record_permission_mvp309` en sesión SQL administrativa `postgres` para registrar esa declaración previa, distinguiéndola expresamente de una firma o mensaje auténtico del participante.

- `arquitecto`: `buyer_standard_operations`, referencia de declaración `owner_chat_20261107_arquitecto`.
- `corralon_ailin`: `supplier_business_contact_after_close`, `owner_chat_20261107_ailin`.
- `corralon_nahuel`: `supplier_business_contact_after_close`, `owner_chat_20261107_nahuel`.

Se validó que las tres personas estaban activas, sus canales vinculados y que no había revocaciones. Una primera transacción **falló por `admin_auth_source_unique_mvp310` al intentar usar una referencia única compartida**; PostgreSQL la revirtió íntegramente, confirmado con 0 registros posteriores. Una nueva transacción atómica con referencias diferentes registró **3/3**, sin crear aprobaciones WhatsApp ficticias.

**Postcheck:** `proveedor_contactable_mvp307('corralon_ailin')=true` y también para `corralon_nahuel`; 1 permiso comprador y 2 permisos comerciales de proveedor, con los contactos privados cifrados, sin reactivación de bajas.

## Controles operativos intencionalmente pendientes

- **Auto-liberación MVP306, lote MVP314 y aviso MVP315 siguen OFF**. Abrirlos puede enviar mensajes reales; no se encendieron durante esta publicación por no tener evidencia verificable de un token Whapi rotado después de que uno apareció en una captura del usuario, ni lectura autenticada de la cuenta Sandbox gratuita/cupo del canal actual.
- La SQL del piloto muestra `whatsapp_inbound_enabled=true`, `whatsapp_outbound_enabled=true`, IA Central y el despacho anterior ON. Esto **no sustituye** el check remoto de Whapi. La Edge nueva publicó el código, no prueba envío automático.
- Antes de esta publicación, última entrada en `whapi_inbox`: 08/11 21:08 ART; 0 ingresos en últimas horas y el webhook registraba 5 POST/200 en 24h, último 09/11 11:16 ART. No se vio un evento nuevo de extremo a extremo. **Un mensaje que se ve en WhatsApp no acredita que entró al servidor.**
- 0 presupuestos IA comerciales `verified` y 1 caso anterior en `review`; ninguna prueba real nueva de arquitecto → 2 PDF → 2 respuestas → preliminares anónimos → cierre → identidades/originales. No afirmar «100%» hasta tener esas evidencias.
- El visor económico preliminar en desarrollo y nuevas integraciones de tracking / Vercel no se publicaron como parte de MVP332. No hubo backup restaurable confirmado (riesgo del piloto reconocido previamente).

## Próximos pasos acotados, sin rehacer configuraciones

1. Verificar estado AUTH y cupo libre de la cuenta Whapi Sandbox ya vinculada, **sin exigir reconfigurar webhook/Body/events existentes**. Si el token antiguo sigue vigente, rotarlo en el panel y actualizar únicamente el secreto protegido correspondiente, nunca pegarlo en chats/logs.
2. Verificar que **un mensaje nuevo** llegue a la tabla `whapi_inbox` del piloto mediante la Edge v71, con identidad y rol correcto.
3. Cuando el canal y los secretos estén acreditados, revisar los gates y rutas de salida, habilitar controladamente una ronda prospectiva con un comprador y dos proveedores dentro del cupo gratuito, con consentimiento comercial ya asentado; mantener límite de costos y sin reintentos inciertos.
4. Validar el circuito real completo y actualizar esta acta según evidencias. No publicar producción principal ni elevar un plan de Whapi.

**Registro independiente:** [Issue #733](https://github.com/ProtectorRudo/Cotironda/issues/733), comentario de publicación del 09/11/2026.
