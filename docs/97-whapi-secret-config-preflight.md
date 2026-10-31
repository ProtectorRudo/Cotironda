# 97 — D033: secretos Whapi por entorno y bloqueo preventivo de instalación

**30/10/2026 · Issue #168 · PR draft sobre #166. No se ha instalado en Supabase DEV.**

## Decisión

Los materiales criptográficos de Whapi **jamás van en GitHub, archivos públicos, navegador ni filas SQL**. Se obtienen de un proveedor de secretos con acceso exclusivo del proceso servidor y se inyectan a un módulo puro de configuración. No crear cuentas, claves, rutas HTTP ni despliegues por el mero hecho de validar configuración.

`src/server/whapi-secret-config.ts` define `cargarConfiguracionWhapiPrivada(vars,entornoEsperado)`. El caller aporta el entorno esperado de un contexto servidor confiable (development/test/production) y el snapshot de secretos. El loader **no lee process.env implícitamente**, no monta un webhook y retorna `null` cuando el flag está ausente o es explícitamente `false`. Para activarlo en el futuro exige `COTIRONDA_WHAPI_ENABLED=true` y entorno idéntico al esperado, junto con todas las claves.

## Contrato de configuración (nombres, NO valores)

| Variable exclusiva del servidor | Uso |
| --- | --- |
| `COTIRONDA_WHAPI_ENABLED` | `false` para deshabilitar; solo `true` habilita el objeto de configuración |
| `COTIRONDA_WHAPI_RUNTIME` | Uno de `development`, `test`, `production`; no se infiere de un header ni de Whapi |
| `COTIRONDA_WHAPI_CHANNEL` | Identificador de canal validado |
| `COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX` | Secreto dedicado del header Whapi, 32 bytes hex; separado de claves HMAC/AES |
| `COTIRONDA_WHAPI_HMAC_ID_HEX` | Clave HMAC de pseudónimo de chat y message-id, 32 bytes |
| `COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX` | Clave HMAC separada para huella de contenido, 32 bytes |
| `COTIRONDA_WHAPI_AES_ACTIVE_ID` | Key-id público no secreto de AES activo; **no se permiten escrituras nuevas como `legacy_d029`** |
| `COTIRONDA_WHAPI_AES_ACTIVE_HEX` | Clave AES-256-GCM activa de 32 bytes |
| `COTIRONDA_WHAPI_AES_READ_KEYS_JSON` | JSON acotado de hasta cinco key-id antiguos con clave de lectura correspondiente; no se usa para cifrar nuevas entradas |

El loader valida hex de 64 caracteres en minúsculas, claves distintas entre todos los usos, formatos de ID, límites de tamaño, claves triviales y variables `NEXT_PUBLIC_COTIRONDA_WHAPI_*` prohibidas. Una validación básica de diversidad de bytes **no certifica la entropía**: generar secretos con CSPRNG confiable en un gestor de secretos. Los errores retornan únicamente `whapi_secret_config_invalid` sin repetir valores.

**La configuración no implica canal operativo:** solo un worker implementado y desplegado podría usar el objeto devuelto. Ese worker/secret manager todavía no existe.

## Regla de rotación AES

D032 admite dos generaciones AES y mantiene el legado D029. D033 incorpora `verificarRetiroSeguroClaves(idsDisponibles,idsARetirar,conteosCompletos)`, un **preflight puro**, sin consulta a base. Solo recomienda retiro si un inventario completo y confiable de PostgreSQL contiene cero filas que dependan de cada clave retirada. La consulta de inventario, backups, política de retención, re-cifrado, rotación de HMAC y aprobación humana de retirada **siguen pendientes**. No tomar la salida de esta función como autorización definitiva si el inventario no es consistente, transaccional, vigente y no incluye backups/colas.

### Riesgo adicional encontrado en la auditoría

Un reenvío idéntico recibido **después** de cambiar la clave AES activa mantiene el mismo message-id y HMAC de contenido, pero obtiene otro `crypto_key_id`. La política D032 lo rechaza como colisión y el receptor devuelve error transitorio: no pierde la fila original ni la confirma dos veces, pero puede producir reintentos repetidos en Whapi. **La rotación completa no está lista para producción** hasta definir reconciliación idempotente de replay histórico independiente del key-id, sin permitir sustitución del ciphertext ni bypass de consentimiento. Registrar como gate de próxima entrega: Issue D034.

Para la etapa de piloto se debe también garantizar continuidad de autorización, fuera de los mensajes WhatsApp, y no cambiar clave HMAC de identidad sin migrar previamente los registros. Nunca afirmar que una mera recarga de variables habilita rotación segura.

## D025 / Supabase alojado — revisión sin tocar DEV

El SQL de D025 incluye `GRANT USAGE ON SCHEMA auth TO cotironda_rounds_reader`. La documentación de Supabase explica que ese GRANT a un rol personalizado puede no hacerse efectivo en un proyecto alojado; también es un riesgo de compatibilidad que un test local PostgreSQL no detecte. En la consulta **read-only** de DEV, `cotironda_rounds_reader` no existe, `rounds_v1` no está instalada, `auth.uid()` sí existe y PostgreSQL alojado utiliza versión 17.11. Por tanto **no se confirmó que ese permiso funcionará** ni se afectaron usuarios actuales. Issue [#167](https://github.com/ProtectorRudo/Cotironda/issues/167) permanece bloqueante hasta auditar/reescribir el acceso a identidad sin depender de grants inoperantes y probarlo contra Supabase gestionado tras una instalación DEV autorizada.

## Pruebas y próximos gates

`tests/unit/whapi-secret-config.test.mjs`: configuración desactivada, formato de secretos, aislamiento de entornos, variables públicas rechazadas, claves duplicadas, clave histórica, conexión únicamente por puertos al broker D029 y preflight que falla ante filas pendientes. Los tests nunca usan credenciales reales.

Para avanzar a un webhook real faltan, además, motor de secretos gestionado, TLS entre worker/Postgres, permisos mínimos revisados en Supabase hospedado, rotación/transición sin loops de reenvío, inventario de claves, control de gastos y retención, autenticidad real del webhook, opt-in, pipeline de adjuntos y E2E comercial. No desplegar sin esos gates.

**UX-001:** el comprador y el corralón no ven claves, cuentas técnicas ni formularios añadidos: toda la complejidad permanece detrás de WhatsApp.
