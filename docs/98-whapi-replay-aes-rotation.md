# 98 — D034: reenvíos WhatsApp idempotentes durante rotación AES

**30/10/2026 · Issue #169 · Etapa 04 · rama `fix/04-whapi-aes-rotation-replay` sobre D033 PR #170.**

## Problema concreto

En D032 el SQL privado comparaba `crypto_key_id` para decidir si un evento repetido coincidía con el ya almacenado. Al cambiar la clave activa de `aes_2026_a` a `aes_2026_b`, el mismo mensaje de WhatsApp llegaba con la misma huella HMAC y el mismo ID, pero un ciphertext y key-id nuevos. El registro original quedaba protegido, pero la función devolvía una colisión y el webhook podía quedar atrapado en reintentos con HTTP 503.

## Corrección con límites de seguridad

`supabase/sql/whapi_replay_across_aes_d034.sql` reemplaza *el cuerpo* de las funciones internas existentes, sin nuevas RPC públicas ni roles, y conserva su propietario restringido `cotironda_whapi_inbox_writer` NOLOGIN/NOBYPASSRLS, `SECURITY DEFINER` y `search_path=''`.

Para un mismo `(channel_id,message_key)`:
- El SQL compara proveedor vinculado por contacto verificado, `chat_key`, `kind`, `source_unix` y `payload_fingerprint` (HMAC calculado con secreto exclusivo del broker y que incorpora canal, chat, ID, tipo, contenido y timestamp).
- Si todo coincide, responde únicamente `{"estado":"entrada_persistida","repetido":true}`, aunque el **key-id AES activo haya cambiado**. No realiza `UPDATE`, no necesita devolver ni descifrar el ciphertext anterior y no confirma ninguna oferta económica.
- Si la huella cambia (por ejemplo, otro precio), cambia el chat, tipo, proveedor o timestamp, continúa rechazando el evento como colisión. Tampoco permite crear mensajes nuevos sin consentimiento/invitación.
- El replay no sobrescribe `crypto_key_id`, `payload_ciphertext`, nonce ni tag. D028 mantiene el trigger de inmutabilidad para toda la tabla.
- La ruta `legacy_d029` y el evento `BAJA` reciben control de timestamp en sus comparaciones de reenvío. No se borran, mueven ni convierten ofertas históricas.

**Trust boundary:** el servidor nunca recibe permiso de elegir directamente un HMAC arbitrario desde WhatsApp. D027 autentica el canal, D029 recalcula `message_key` y `payload_fingerprint` con claves exclusivas servidor; D030 parametriza SQL y D028/D034 verifican vínculo. El rol SQL gateway sigue siendo EXECUTE-only, sin SELECT directo de contactos, rondas o inbox.

## Evidencia a verificar

- `supabase/tests/ci/105_whapi_replay_across_aes.sql`: crea datos ficticios, guarda key-id A, repite con key-id B y ciphertext distinto, valida recibo `repetido:true`, confirma una sola fila y bytes AES antiguos intactos; nueva entrada B se guarda, alteraciones de huella/timestamp/tipo fallan, replay funciona desde función antigua y tras cerrar la ronda. El fixture termina con `ROLLBACK`.
- `tests/unit/whapi-aes-key-rotation.test.mjs`: mock del almacén ahora usa identidad del mensaje y su HMAC, no key-id, y comprueba reenvíos y precio alterado.
- `scripts/ci/whapi-pg/e2e.mjs`: driver pg real, login SQL reducido, varias conexiones PostgreSQL17; reenvío histórico con clave B devuelve 200 y duplicado; precio diferente con B da error, sin modificar la oferta original. El job vuelve a comprobar las columnas de key-id A/B, los sobres AES y dos bajas.

**No confundir con producción:** estas pruebas validan un contrato real SQL y un webhook sintético en PostgreSQL efímero CI; no validan el canal Whapi real, firma/origen, expiración de mensajes, conectividad DEV, rotación de HMAC, recuperación de secretos, ni descifrado de archivos multimedia.

## Gates que siguen vigentes

- D025/Issue #167: permisos del esquema `auth` en Supabase alojado; la solución SQL CI no lo certifica.
- Gestionar claves AES históricas en secret manager, su retención y backup; un replay con misma huella **no necesita** recuperar clave vieja, pero leer el presupuesto histórico sí.
- Identificación cuando un proveedor pertenece a varias rondas, autorización de webhook real, consentimiento por canal, manejo de mensajes después de cierre/BAJA, descarga segura de medios y outbox de mensajes.
- `crypto_key_id` es inmutable; **no retirar una clave** mientras haya filas o backups que dependan de ella.

Todo este trabajo es **solo GitHub y CI**, PR draft, sin instalar en Supabase DEV/producción, sin contactos, mensajes Whapi ni uso de IA. UX-001 se mantiene: reenviar un presupuesto no debe exigir ninguna acción extra al corralón.
