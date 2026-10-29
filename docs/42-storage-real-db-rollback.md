# 42 — Ensayo RLS de Storage en Supabase REAL con ROLLBACK

**29/10/2026 · Etapa 01 · Issue #55 · PR #56 (draft).**
Proyecto único de prueba: `cotironda-dev` (`qkercsoqhehbenbbncwk`). NO se utiliza base comercial ni se habilita registro.

## Problema que se buscó resolver
Hasta esta validación, las políticas de Storage estaban en la base gestionada y los tests adversariales corrían solo en PostgreSQL 17 con el esquema mínimo `storage.objects` emulado. No se podía afirmar que el **esquema real y las políticas desplegadas** permitieran el mismo aislamiento.

## Procedimiento reproducible y reversible
Archivo `supabase/tests/manual/10_storage_rls_dev_rollback.sql`. Diseñado y auditado antes de ejecutar:

- Requiere `registration_settings.enabled=false`, 0 empresas, 0 membresías, 0 filas de objetos en el bucket y bucket privado con límite 10 MiB. Si una condición no se cumple, **falla cerrado**.
- Selecciona internamente las dos cuentas de ensayo ya existentes en `auth.users`, una con correo confirmado y otra no. **No consulta ni devuelve emails, IDs, contraseñas, tokens ni metadatos sensibles**. No escribe `auth.users`.
- Dentro de `BEGIN`/`ROLLBACK`, crea dos empresas ficticias y dos membresías, y registra dos **filas de metadatos** en `storage.objects`. **No carga archivos físicos al Storage API ni crea URL de descarga**.
- Utiliza `SET LOCAL ROLE authenticated` y un `request.jwt.claim.sub` emulado para comprobar las políticas **reales del Postgres de Supabase**. Una cuenta sólo lee su propia empresa; deniega carga sobre otra empresa y extensión JS.
- La otra cuenta sólo ve sus propios metadatos. Repite la lectura con la primera para confirmar el aislamiento cruzado.
- Cambia el rol de la primera membresía a `member`: puede leer pero no insertar. Cambia luego su estado a `suspended`: no lee ni escribe.
- Con `SET LOCAL ROLE anon` e incluso un `sub` falsificado: no lee ni inserta.
- Antes del `ROLLBACK` exige que existan exactamente las dos empresas, dos membresías y dos metadatos de objeto esperados. Después del `ROLLBACK` vuelve a consultar que organizaciones, membresías y objetos sean **0**, y que el registro siga apagado.
- El ensayo solo simula claims SQL; **no prueba firmas criptográficas ni el gateway HTTP de Supabase Auth/Storage**, tampoco MIME/tamaño reales, validación antivirus ni sesiones revocadas. La segunda cuenta no confirmada sirve únicamente para impersonación SQL; no se ha comprobado que pueda iniciar sesión por Auth y no se pretende permitirlo.

## Evidencia de ejecución
Se ejecutó con la conexión administrada Supabase al proyecto `cotironda-dev` usando el SQL versionado exacto. **Todas las aserciones pasaron**; la salida de la transacción cerrada fue:

| Indicador | Resultado |
| --- | ---: |
| Organizaciones persistidas | **0** |
| Membresías persistidas | **0** |
| Objetos persistidos en bucket | **0** |
| Registro comercial habilitado | **false** |

No se usó `service_role`, no se editaron permisos, no se modificaron migraciones, no hubo inserciones permanentes de empresas ni archivos. La ejecución no sirve para afirmar que se efectuó una subida/descarga HTTP.

El test unitario `tests/unit/storage-live-rollback-safety.test.mjs` impide que modificaciones futuras al script eliminen accidentalmente el `ROLLBACK` o introduzcan DDL, `COMMIT`, altas de `auth.users` o cambios de buckets/registro.

## Pendientes que deben seguir abiertos
1. E2E de **Storage HTTP real** (carga/descarga y límites MIME/tamaño) con una cuenta confirmada y **empresa de ensayo autorizada por un procedimiento seguro**. Se requiere diseño de la vida útil del fixture y eliminación tanto del objeto físico como del metadata.
2. Escaneo antimalware, prevención de ZIP bombs, límites de procesamiento, compatibilidad real de DOCX/XLSX y política de cuarentena.
3. Retención, limpieza de huérfanos, backups y restauración probada.
4. Revocación inmediata de acceso con access token vigente: usar guard servidor que consulte `auth.sessions`; RLS de Storage basada solo en `auth.uid()` **no ofrece esa garantía**.
5. Respuesta HTTP 429 real de PostgREST sin crear empresas, y consolidación de los PR apilados antes de cerrar la Etapa 01.

**No fusionar ni publicar.** Dominio `cotironda.com` comprado en Hostinger pero aún no conectado.

Referencia: [Supabase Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [Issue #55](https://github.com/ProtectorRudo/Cotironda/issues/55), [PR #56](https://github.com/ProtectorRudo/Cotironda/pull/56).
