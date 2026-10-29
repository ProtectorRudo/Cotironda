# 45 — Cuarentena privada y ledger de ingestión: base del pipeline documental

**29/10/2026 · Etapa 01 · Issue #62 y PR #63 en borrador. No hay ingesta habilitada.**

## Decisión técnica — no enviar 10 MiB por Next
Se verificó en documentación oficial de Vercel que el cuerpo máximo para solicitudes a **Vercel Functions es 4,5 MB**. Nuestro bucket original acepta **10 MiB (10.485.760 bytes)**: no sirve crear un endpoint Next.js que reciba todos los archivos por `request.formData()` y luego los reenvíe. Vercel devolvería `413 FUNCTION_PAYLOAD_TOO_LARGE` antes de que corra la lógica, y almacenar/sanitizar la totalidad del contenido dentro de la Function agravaría consumo de RAM.

Supabase documenta que `createSignedUploadUrl()` emite un enlace válido por **dos horas**, usable sin autenticación adicional en el momento de subir. **No se considera un acceso inmediatamente revocable al cerrar sesión.** Solo sería admisible en una cuarentena inaccesible a usuarios, con un nonce/objeto de una única operación, límites y limpieza/abuso auditados. **En este avance NO se emite ninguno**.

Fuentes:
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/errors/function_payload_too_large
- https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
- https://supabase.com/docs/guides/storage/security/access-control

## Migración 11 — infraestructura cerrada, sin escritura del cliente
- Bucket `cotironda-upload-quarantine`, `public=false`, 10 MiB, seis MIME (PDF, DOCX, XLSX, JPEG, PNG, WebP). No agregar `SELECT`, `INSERT`, `UPDATE` o `DELETE` RLS a `authenticated` ni `anon`.
- Migración exige que en `storage.objects` solo exista la política previa de **lectura privada** `cotironda_buyer_drafts_read_member`, con `storage_session_active()`; de otro modo aborta, porque Storage combina políticas permisivas con OR y no queremos heredar una regla genérica amplia.
- `cotironda_private.document_intake_jobs`: tabla interna con `organization_id`, `requested_by`, `request_id`, `file_id` e `idempotency_key` UUID; tamaño y MIME declarados, estado, hash, veredicto/versión/fecha de escaneo y caducidad. **No contiene bytes** del archivo ni URLs firmadas.
- Restricciones: `UNIQUE(organization_id,idempotency_key)` evita solicitudes duplicadas por reintentos; `UNIQUE(organization_id,file_id)` evita colisiones de objeto; no se puede marcar como `approved` sin `scan_verdict=clean`, `scanner_version`, `scan_completed_at` y `sha256_hex` de 64 caracteres.
- Trigger SQL de estados: `pending → quarantined → scanning → approved/rejected/failed` con rutas explícitas para error y expiración. Prohíbe cambiar identidad del documento y alterar registros terminales. El `requested_by` se puede poner a NULL al borrar cuenta Auth; no se reasigna entre usuarios.
- RLS activa en ledger privado y sin políticas para clientes. `anon`/`authenticated` **sin privilegios de tabla**; `service_role` solo `SELECT/INSERT/UPDATE`, no `DELETE`. El esquema `cotironda_private` ya está excluido de la API pública.
- **Nada de esto escanea bytes.** La presencia del campo `scan_verdict=clean` no significa que el escáner exista: un proceso interno, todavía no implementado, deberá firmar el veredicto bajo controles propios.

## Próximo flujo autorizado (NO implementado)
1. El comprador autenticado solicita iniciar un envío indicando empresa, solicitud y formato. Backend verifica identidad firmada, sesión vigente, membresía/rol, origen CSRF, cuotas, tamaño y `idempotency_key`; no recibe la totalidad de 10 MiB a través de Next.
2. Se crea una fila `pending`. Para archivos pequeños se podrá usar un gateway apropiado; para mayores se evaluará una carga firmada **exclusivamente a cuarentena**. Nunca entregar token service_role, URL firmada de bucket final ni ruta de otro tenant.
3. Un worker asíncrono lee solo cuarentena, comprueba magic bytes completos y contenedores Office/PDF contra zip bombs y contenido activo en sandbox, ejecuta antivirus real, calcula SHA-256 y registra veredicto y versión verificable. Si falla/timeout, queda `failed` o `rejected`, jamás `approved`.
4. Solo el proceso interno promociona un documento aprobado al bucket privado final y registra la relación con la solicitud. El bucket de borradores continuará sin política INSERT de usuario.
5. Limpieza programada: 24h para objetos temporales y trabajos no finalizados (plazo tentativo sujeto a costos/operación), reintentos limitados y deduplicados, detección de huérfanos y logs sin datos personales ni URLs firmadas.
6. Lectura protegida por sesión actual y empresa; definir revocación de URL prefirmada, borrado total, backup y restore antes del piloto.

## Seguridad y límites del cambio
Se protege **cualquier** archivo nuevo mediante cierre preventivo; ningún usuario comercial puede cargar hoy. No se escogió ni conectó ClamAV ni otro motor, ni se creó un worker, webhook, ruta de subida, clave de servicio o función en producción. El registro sigue apagado.

Un bucket privado sin RLS de cliente reduce exposición, pero **un futuro link firmado de carga todavía sería un permiso temporal para escribir en cuarentena durante dos horas**; si eso no es aceptable, será necesario seleccionar otro transporte con TTL controlado o un gateway dedicado. La aprobación debe depender de escaneo real y evidencia, no de metadatos autocontenidos.

## Pruebas
`supabase/tests/ci/97_quarantine_ledger.sql`: datos sintéticos `BEGIN/ROLLBACK`; chequea privacidad, ACL, aislamiento entre tenants, duplicados, MIME y tamaño; rechaza aprobación sin evidencia y cambios en identidad; comprueba transiciones válidas. Se ejecuta tras migración 11 en ambos caminos PostgreSQL 17. Nada toca Storage API remota ni produce archivos.

**Control de publicación:** PR draft apilado, solo `cotironda-dev` tras CI y auditoría. No cambiar DNS, Vercel, `main` ni registro comercial.
