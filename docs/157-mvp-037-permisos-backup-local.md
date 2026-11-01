# 157 — MVP-037: carpetas privadas verificadas antes del backup DEV

31/10/2026 · Issue #287 · rama `fix/mvp-037-backup-private-dirs`.

## Hallazgo y decisión

El asistente de un comando MVP-035 creaba las carpetas mediante `mkdir -p -m 700`. Si ya existían con modo 0755/0777, `mkdir` no les corregía esos permisos y solo se comprobaba `-d`. Un tercero con escritura en un directorio podría reemplazar la identidad age o manipular el paquete. No basta con que el archivo de clave sea 0600: **las carpetas que lo contienen también deben ser privadas**.

Ahora `scripts/ops/check-private-backup-dirs-mvp037.mjs` valida **antes de crear clave age o solicitar la URL de conexión**:
- HOME es absoluto, del usuario actual, no apunta a un symlink y no tiene escritura para grupo ni otros.
- `$HOME/.cotironda-keys` y `$HOME/.cotironda-backups` son directorios reales del usuario, no symlinks, sin permisos de grupo ni otros (modo 0700 o más estricto).
- Ningún componente de las rutas usa un symlink, ni se aceptan directorios fuera de HOME o el mismo directorio para clave y respaldo.
- Ante fallo, el asistente muestra **un código de error sin rutas, claves ni conexiones** y se detiene; nunca cambia permisos de carpetas existentes automáticamente, lo cual podría interferir con datos ajenos.

No se modifica el motor cifrado D075, la clave existente, Postgres ni ninguna configuración alojada. El operador usa el **mismo comando**:

```bash
bash scripts/ops/backup-dev-asistido.sh
```

Si aparece `COTIRONDA_BACKUP_PRIVATE_DIRECTORY_UNSAFE`, inspeccionar propietario y permisos de las carpetas en **la computadora privada**; no compartir capturas o contenidos de clave, ni intentar el backup hasta corregirlos desde una cuenta con permisos legítimos.

## Pruebas

`tests/unit/mvp037-private-backup-dirs.test.mjs` utiliza directorios temporales ficticios, `chmod` y symlinks reales en el runner efímero para verificar el caso 0700 y rechazos 0755/0777/0770/0711, HOME escribible, enlaces simbólicos, rutas externas y CLI sin divulgación. No lee contraseñas ni conecta Supabase. Sumado a tests MVP-035, CI PostgreSQL17, PostgREST, Next y verificaciones comerciales existentes.

## Bloqueo preservado

Este avance mejora la **seguridad de obtención** de un respaldo futuro, pero **no ha ejecutado** el backup real ni un restore. Issue #175 exige descargar cinco piezas SQL de DEV con una clave bajo custodia privada y probar restauración en instancia aislada, incluyendo Auth, Storage, Vault, Edge, RLS y extensiones. Sin ese gate, D024+ permanece sin instalar y Whapi no se activa. No hay despliegue Vercel ni cambios de DNS.
