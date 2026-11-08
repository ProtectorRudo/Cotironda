# Decisión 448 — MVP318: exportación gratuita, cifrada y ensayo de recuperación

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde», continuar desarrollo, pruebas y auditoría. **No publicar ni activar Whapi/cron, no tocar producción ni exportar datos reales mediante GitHub.**

## Auditoría real de solo lectura

Se consultó directamente el proyecto Supabase `cotironda-piloto`, identificador `ilggkalaafhtiysyzlmg`, PostgreSQL 17, **sin leer datos personales**:

| Componente | Estado verificado |
| --- | --- |
| Esquema `cotironda_piloto_privado` | **94 tablas** propias |
| Tablas físicas de `public` | **0** (sí hay RPC y otras definiciones) |
| `auth.users` | **0** usuarios al momento de la consulta |
| Storage | **1 depósito**, `cotironda-piloto-originals` |
| Archivos originales reales | **7 objetos** |

Los números pueden variar durante una prueba activa. **Las funciones Edge, los secretos cifrados de entorno, la configuración del proyecto, los usuarios Auth futuros y los objetos binarios de Storage no se recuperan automáticamente con un solo `supabase db dump`.**

## Alternativa gratuita

Supabase recomienda **exportaciones manuales** para proyectos sin backups diarios incluidos en el plan. La CLI `supabase db dump`:
- Exporta por defecto **esquema, sin datos**. Los datos requieren `--data-only` y los roles `--role-only`.
- Filtra los esquemas administrados `auth` y `storage`: **no representa por sí sola una copia completa del proyecto**.
- Los documentos de Storage se descargan separadamente. El `backup` de PostgreSQL solo contiene metadatos de Storage y **no recupera los objetos eliminados**.

Fuentes oficiales:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/storage/management/download-objects
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Exportación local diseñada (no ejecutada sobre datos reales)

`scripts/piloto/mvp318-exportar-resguardo-local.sh` es un procedimiento **para ejecutar en una computadora autorizada**, nunca en GitHub, nunca como cron ni mediante Supabase Edge:

1. Verifica que `supabase/.temp/project-ref` coincide exactamente con el ID de Cotironda piloto. Si no coincide, **aborta sin conectarse**.
2. Requiere CLI Supabase autenticada y enlazada localmente, Docker para `db dump`, `age` para cifrado por contraseña, y Bash/tar/sha256sum. Detecta las variantes `--linked` o `--remote` mediante `--help`; no supone que todas las versiones sean iguales.
3. Exporta tres archivos separados (`roles.sql`, `schema.sql`, `data.sql`) del esquema privado y `public`. Una exportación sin datos falla.
4. Descarga **recursivamente** los originales de `ss:///cotironda-piloto-originals` y exige encontrar **los 7 archivos** registrados al auditar. Si cambió el número, la copia queda invalidada hasta reauditar.
5. Calcula los SHA-256 de los componentes, arma el paquete por streaming `tar | age -p` (no crea un TAR sin cifrar permanente) y verifica que el archivo cifrado se descifra y se lee sin errores.
6. Guarda únicamente `*.age` cifrado y su `*.sha256` en `~/Cotironda-Resguardos-Privados/`, fuera del repositorio; nunca sube contactos, presupuestos ni secretos a GitHub. Los tres SQL y originales pasan temporalmente por un directorio con permisos restringidos del equipo local y se borran al salir. Recomendamos equipo con disco cifrado, sin sincronización automática a nubes públicas.

**No publicar este paquete ni la contraseña, no enviarlos por chat, no guardarlos en GitHub.** La contraseña debe conservarse separadamente; sin ella el paquete será irrecuperable.

### Uso en el equipo del responsable

En una PC con Bash o WSL, herramientas indicadas instaladas y Supabase enlazado al proyecto exacto:

```bash
supabase login
supabase link --project-ref ilggkalaafhtiysyzlmg
bash scripts/piloto/mvp318-exportar-resguardo-local.sh
```

El proceso solicita credenciales solamente mediante Supabase CLI y contraseña para el cifrado `age`; **no poner contraseñas en comandos, archivos del repositorio ni en el chat**. Si el plan, la conexión o la CLI requieren ajustes, detenerse, comprobar `supabase --help` y evitar improvisar comandos destructivos.

La salida indica **exportación local cifrada verificada, NO restauración real comprobada**. Antes de una publicación real, falta restaurar una **copia de ese mismo paquete real** en otro entorno Supabase/PostgreSQL aislado, inventariar los metadatos y archivos recuperados y comparar seguridad/funciones y totales.

## Ensayo automático en CI (datos íntegramente ficticios)

`scripts/piloto/mvp318-probar-resguardo-pg17.sh` y `.github/workflows/cotironda-mvp318-restore-drill.yml`:
- Crean el estado sintético PostgreSQL17 y ejecutan las nueve migraciones MVP309–315.
- Generan un archivo `pg_dump --format=custom`, SHA-256, restauran en **otra base separada** `cotironda_restore`.
- Comparan cantidades de participantes/rondas y tablas privadas, huellas SHA-256 de las RPC críticas, acceso denegado para `anon`/`authenticated`, y gates automáticos OFF.
- Verifican que un archivo cortado a la mitad no pase como copia restaurable.
- **No tienen secretos Supabase**, no hacen conexiones externas, no suben artefactos de backup y no envían WhatsApps.

Este ensayo comprueba que el proceso general de `pg_dump/pg_restore` funciona para la base sintética. **No demuestra que la exportación SQL de la CLI de la base real sea restaurable; son formatos distintos y todavía hay que probar el paquete real.** Este límite debe permanecer explícito.

## Whapi

No se accedió a la cuenta Whapi ni a credenciales de facturación. La expiración comunicada del período de prueba sigue siendo un bloqueo para enviar WhatsApps reales, aunque el webhook Edge de Supabase figure `ACTIVE` y exista un flag de salida encendido. Se mantiene **sin costo, sin envíos y sin reintentos automáticos**.

## Checklist de aceptación

- [x] Inventario real solo lectura: **94 tablas**, **0 usuarios Auth**, **7 archivos Storage**.
- [x] Procedimiento local fail-closed diseñado para exportar cifrado con costo de software cero.
- [ ] CI PostgreSQL17 verde con restauración real aislada y truncamiento rechazado.
- [ ] Backup de **datos reales** completado en equipo autorizado: NO realizado.
- [ ] Restauración de **datos reales** a entorno aislado verificada: NO realizada.
- [ ] Cobertura de configuraciones Edge, Auth y metadatos Storage validada.
- [ ] Cuenta Whapi nuevamente operativa sin comprometer costos.
- [ ] E2E completa del piloto.

**Decisión:** la falta de backups automáticos no impide mejorar ni ensayar el software. No se declara **publicación segura** hasta verificar al menos una recuperación de la copia real, integridad de los archivos y la continuidad de los secretos/configuración. `Luz verde` sigue siendo solamente desarrollo.
