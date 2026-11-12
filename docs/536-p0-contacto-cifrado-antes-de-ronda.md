# Acta 536 — P0: contacto cifrado pre-ronda para avisos Whapi

**Fecha:** 12/11/2026. **Instrucción:** avanzar en desarrollo y registrar checklist/plan maestro. **Sin despliegue, sin escritura al piloto, sin WhatsApp saliente y sin crear nuevas rondas.**

## Qué se verificó
El envío de condiciones ocurre **antes** de crear una ronda. El descifrador ya existente D068 usa la estructura y HMAC del otro subsistema y el receptor M313 del PILOTO exige `requestId`, por lo que ninguno puede emplearse directamente sin riesgo de atribución errónea. El webhook real de `cotironda-piloto-whapi/index.ts` usa `HMAC-SHA256('cotironda|pilot|chat|canal|chat_id')` y contactos cifrados con AES-256-GCM/AAD `chat_hmac|cotironda-contact-v1`. No migrar ni duplicar el almacén de contactos.

Auditoría Supabase PILOTO **solo lectura** el 12/11/2026: 3 registros `participant_channels_mvp109`, **3 con contacto cifrado y vínculo auténtico**, **2 de proveedores habilitados con contacto cifrado**. No se consultaron ni expusieron teléfonos o ciphertext. Las autorizaciones de descargas siguen OFF, 0 operadores Auth MFA activos, 0 consentimientos originales y 1 ronda `prepared` vigente; M362 y P0 SQL aún no instalados.

## Desarrollo
- `supabase/piloto/p0_whapi_terms_sender_atomic_off.sql` ampliado con función **privada y solo lectura** `terms_recipient_packet_p0(job,lease)`. Antes de `BEGIN` permite leer únicamente un paquete AES-GCM, `contact_sha256` y chat HMAC del proveedor verdadero cuyo `participant_channels_mvp109` tiene vínculo autenticado y `bound_at <= created_at` del trabajo. Rechaza lease errado, estado `in_flight`, política OFF, BAJA y chat cruzado. ACL exclusiva de `cotironda_pilot_terms_sender_p0` NOLOGIN; `anon/authenticated/service_role` sin permisos.
- El claim revisa la existencia del vínculo cifrado, evitando consumir leases sin destinatario recuperable. Nunca se agrega teléfono en claro a tabla de trabajos.
- `src/server/whapi-terms-recipient-p0.ts`: descifrador Node exclusivo del PILOTO que valida contrato exacto de respuesta, identidad de trabajo/lease/proveedor/chat/canal, AES-GCM con AAD del webhook, SHA256 del contacto y HMAC del canal. Cualquier mismatch **bloquea** y no ofrece fallback a número por configuración.
- `src/server/whapi-terms-sql-p0.ts`: exporta composición `crearPuertosSqlAvisosCifradosP0` para usar el mismo `committedRpc` privado del emisor D055 con el resolver AES correcto; sin nueva API pública.
- `tests/unit/p0-whapi-terms-recipient.test.mjs`: pruebas con cifrado sintético real (Node crypto) de buen caso, llave distinta, HMAC D029 incompatible, proveedor/lease cambiado, ciphertext/nonce/tag adulterados, payload inesperado, red ausente y composición de emisor.
- `supabase/tests/ci/p0-terms-sender-pg17.sql`: fixture agrega `participant_channels_mvp109`; comprueba que el paquete sólo se lee para un lease válido y antes de `BEGIN`, y ACL contra API roles. Se ejecuta **con ROLLBACK**; la prueba PostgreSQL no descifra el contenido, lo hace la unidad Node.
- `.github/workflows/unit-tests.yml`: job PG17 P0 corre en esta rama y en PR #808.

## Resultado y límites
- [x] Funciones SQL + resolver AES-GCM + composición y pruebas incorporados a PR nuevo.
- [ ] CI final 5/5 y job PG17 P0 en SHA definitivo: **verificar antes de afirmar aprobado**.
- [ ] No existe todavía login DB de servicio autorizado/aislado, inyección real de claves del piloto y ejecución por cron/worker autenticado. **El código NO está conectado a WhatsApp real**.
- [ ] La política para compartir originales de proveedores no ganadores continúa en borrador. Falta operador Auth AAL2 REAL y revisor de aceptación explícita de respuesta entrante; la constancia de aviso no es consentimiento.
- [ ] Falta autenticación del comprador, dos originales de misma ronda, seguimiento y cierre/descarga autentificados E2E. **P0–P5 ABIERTOS**.

**Siguiente acción concreta:** consolidar ejecutor servidor con conexión PG SSL y rol mínimo verificado (no reutilizar D088 que apunta a otro proyecto), luego revisión de respuesta expresa por operador MFA, políticas aprobadas y despliegue **solo** bajo instrucción `Publicalo en cotironda-piloto`. No crear una ronda superpuesta, ni tocar relecturas del PDF si no bloquean ese circuito.

Ver [checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md).
