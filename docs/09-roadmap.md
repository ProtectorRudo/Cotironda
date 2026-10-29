# 09 — Hoja de ruta y puertas de calidad

**Estado auditado 29/10/2026:** Etapa 00 documentada; Etapa 01 en PR apilados hasta #63. Once migraciones aplicadas solamente en `cotironda-dev`, incluida la décima de bloqueo de cargas directas, registro SQL y portal comercial cerrados. El Auth Hook está ACTIVADO en desarrollo y el propietario probó un JWT real desde Chrome con cuentas de ensayo; CI de PostgreSQL, Next y SSR/HTTP aprobado sobre datos simulados. **Las migraciones 8 y 9 de Storage privado están aplicadas en `cotironda-dev`: bucket RLS y guard de sesiones revocadas; mientras falta backend antimalware, la décima migración cierra la carga directa y la onceava prepara una cuarentena inaccesible con ledger privado, aún sin antivirus ni interfaz de carga** (la auditoría inicial encontró 0 buckets en dev); falta un ensayo real de revocación JWT, prueba HTTP 429 auténtica controlada y consolidación de PR. El dominio comprado `cotironda.com` está registrado en Hostinger pero NO apunta a Vercel; su configuración se programa en la puerta de publicación. Ver `docs/38-dominio-hostinger-vercel.md` y `docs/39-storage-privado-pendiente.md`.

| Etapa | Entregable | Criterio de aprobación |
| --- | --- | --- |
| 00 Documentación | Visión, reglas, arquitectura, pruebas, decisiones, riesgos | Documentos coherentes, abiertos registrados y revisión comercial |
| 01 Usuarios y base | Organizaciones, roles, rubros, catálogos, zonas, Storage privado | Autorización cruzada y RLS probadas con varias empresas |
| 02 IA documental | Extracción por archivo, trazabilidad, aclaraciones y confirmación | Corpus realista y casos extremos aprobados |
| 03 Licitaciones | Rondas, invitaciones, ofertas versionadas, rankings y adjudicación | Matemática determinista y casos parciales aprobados |
| 04 WhatsApp | Adaptador Whapi, webhooks, IA conversacional, colas y opt-out | Ciclo real probado con números autorizados, sin duplicados |
| 05 UX | Portales comprador/proveedor/admin, móvil y escritorio | Flujos completos usables, pruebas end-to-end |
| 06 Pagos y protección | Suscripciones, webhooks, gastos, auditoría, backups | Pagos idempotentes y restauración/pruebas de seguridad |
| 07 Piloto | Primeros compradores y proveedores voluntarios | Rondas completas, costos medidos y retroalimentación |

## Secuencia profesional por Issue
Inspección de situación actual → impacto y aceptación → rama → implementar → pruebas → auditoría → PR → revisión → merge → producción sólo autorizada.

## Prioridad
Primero flujo pequeño con datos sintéticos. Activar WhatsApp real cuando base y autorización ya sean seguras. No optimizar por número de pantallas: optimizar por ronda de cotización completa y confiable.

### Desarrollo paralelo de interfaz (sin desplegar backend)
Se creó el PR #8, apilado sobre el PR #4: portal Next.js para alta de empresas e inicio de sesión, preparado para Supabase Auth. Pasó build de Next.js y los tests HTTP/SQL, pero queda **inactivo** hasta configurar las credenciales de aplicación y completar pruebas E2E con sesión real. La base Supabase dedicada y la migración ya existen. La etapa 01 continúa abierta.

### Auditoría de identidad (29/10/2026)
La quinta migración aplicada a `cotironda-dev` movió el privilegio de la RPC pública a una función privada, eliminando la advertencia WARN. Se exige claim de correo confirmado emitido por Auth Hook basado en `auth.users` y la cerradura BD sigue `false`. La Etapa 01 **no está cerrada**: el Hook ya fue habilitado y se probó JWT real mediante Chrome; Storage privado ya configurado en desarrollo con revocación SQL, pero siguen pendientes AV, JWT revocado por HTTP real, 429 HTTP remoto y pruebas del portal completo con Auth real. Ver `docs/23-hook-correo-auditoria.md`.


### Prueba HTTP de sesión y cuotas mediante PostgREST en CI (PR #71)

Se ejecutó PostgREST real con PostgreSQL efímero y 11 migraciones, JWT HS256 de ensayo firmados dentro del runner: HTTP 429 en intento 21, JWT adulterado o expirado denegado y sesión revocada con token previo aún firmado rechazado con HTTP 403 incluso después de nuevo login. **5/5 CI SUCCESS, 142/142 unitarias.** No se usó Supabase Auth remoto, ni se habilitaron empresas, archivos ni producción. Quedan pendientes E2E con JWT emitido por Supabase Auth y cookies HTTPS, HTTP 429 remoto, WARN de contraseñas filtradas y revisión de PRs apilados. Ver `docs/48-postgrest-real-http-ci.md`.


### Auditoría HTTP multiempresa y revocación (PR #73 y #75, sin publicar)

Se comprobó por HTTP PostgREST auténtico con tokens de CI el aislamiento entre dos proveedores, dos propietarios, miembro lector y manager suspendido; el propio propietario puede escribir, pero no en otra empresa. La auditoría SQL read-only en `cotironda-dev` señaló un **bloqueo pendiente real**: las 17 políticas de cliente para las siete tablas comerciales no validaban la presencia de sesión actual en `auth.sessions`; solo Storage y registro tenían guard. En PR #75 se ensayó exclusivamente en CI una protección `AND` que invalida lectura/escritura tras revocación y no reanima tokens antiguos con un nuevo login: **149/149 unitarias, 5/5 workflows SUCCESS**. No hay migración oficial de este cambio ni aplicación a `cotironda-dev`. Antes de cerrar Etapa 01: versionar migración con CLI, reconstruir 12 migraciones, auditarla y probarla en desarrollo; completar pruebas JWT auténtico tras logout, HTTP 429 remoto, cookies HTTPS y WARN contraseñas filtradas; consolidar PRs sin publicarlos. Ver `docs/50-session-aware-rls-ci.md`.


### Migración 12 instalada en desarrollo (Issue #76 / PR #77, sin publicar)

Se cerró en SQL de `cotironda-dev` la ventana detectada en las siete tablas comerciales: 17 policies de clientes comprueban ahora sesión válida vía función privada existente. Las seis del registrador permanecen intactas; registro, Storage y negocio comercial siguen cerrados. Versionado oficial reconciliado con la base: `20261029234236_commercial_session_guard.sql`; tests PostgreSQL y PostgREST con 12 migraciones, sin uso de JWT remotos ni cambios en producción. **La Etapa 01 no está cerrada**: faltan autenticación HTTPS real tras logout/refresh, HTTP 429 del gateway Supabase remoto, habilitación de protección de contraseñas filtradas y revisión de la cadena de PR antes de habilitar clientes. Ver `docs/51-commercial-session-migration.md`.
