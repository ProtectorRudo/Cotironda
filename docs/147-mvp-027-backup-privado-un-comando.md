# 147 — MVP-027: un comando privado para verificar respaldo cifrado de DEV

31/10/2026 · Issue #267. Este cambio simplifica el **respaldo SQL lógico** de Cotironda DEV; no instala SQL ni activa rondas.

## Objetivo

No pedirle al usuario que ejecute cinco programas de exportación y después controle cinco archivos manualmente. La computadora de confianza solo necesita **una ejecución** después de instalar Node.js 22+, PostgreSQL 17 client y age (con `age-keygen`).

El comando `scripts/ops/cotironda-private-backup-d075.mjs` hace:
1. Niega ejecución desde GitHub Actions, CI, Vercel y Windows sin entorno POSIX (usar WSL en Windows).
2. Comprueba que la variable privada `COTIRONDA_DEV_DB_URL` apunte **exclusivamente** a `qkercsoqhehbenbbncwk`, base postgres, puerto 5432 y TLS; nunca imprime la URL.
3. Valida permisos de identidad age: archivo propio 0600, ruta absoluta sin symlinks, un solo hardlink. Comprueba versiones de `pg_dump`, `pg_dumpall`, `psql` **17.x**, `age` **1.x**.
4. Ejecuta `age-keygen -y` para comprobar que la identidad local realmente puede descifrar el destinatario `COTIRONDA_AGE_RECIPIENT`; falla **antes** de contactar DEV si no coincide. No crea ni revela la clave.
5. Reutiliza el exportador de cinco piezas D003/MVP-022, con snapshot PostgreSQL compartido; flujo `pg_dump | age` sin SQL en claro en disco. Verifica manifiesto SHA-256 D039 y descifra las cinco piezas mediante el control D041, descartando los bytes en memoria.
6. Devuelve siempre `restore_verified:false`, `gate_d024_open:false`, `storage_bytes_included:false`, `auth_edge_configuration_included:false`, `vault_cross_project_restorable:false`. Un descifrado exitoso **no** equivale a una restauración.

## Operación cuando haya una computadora de confianza

No ejecutar en teléfono ni en Google Colab, GitHub Actions, Vercel, cloud compartida o lugar donde otros vean procesos/archivos. No copiar contraseñas, claves privadas o dumps a ChatGPT ni a GitHub.

En terminal privada Linux/macOS/WSL, con el repositorio oficial y herramientas instaladas:

```bash
umask 077
mkdir -p "$HOME/.cotironda-private"
chmod 700 "$HOME/.cotironda-private"

# Ejecutar esta creación UNA SOLA VEZ (si el archivo ya existe, NO reemplazar).
age-keygen -o "$HOME/.cotironda-private/identity.txt"
chmod 600 "$HOME/.cotironda-private/identity.txt"

# Copiar la URL de conexión de cotironda-dev del panel Supabase, en el
# equipo privado. Debe ser connection string de base postgres, puerto 5432,
# sslmode=require. No debe aparecer en historial de shell.
read -rsp 'URL privada de Cotironda DEV: ' COTIRONDA_DEV_DB_URL
printf '\n'
export COTIRONDA_DEV_DB_URL
export COTIRONDA_AGE_RECIPIENT="$(age-keygen -y "$HOME/.cotironda-private/identity.txt")"

# Elegir un destino nuevo y vacío por ejecución, fuera del repositorio.
node scripts/ops/cotironda-private-backup-d075.mjs \
 "$HOME/.cotironda-private/respaldo-dev-001" \
 "$HOME/.cotironda-private/identity.txt"

unset COTIRONDA_DEV_DB_URL COTIRONDA_AGE_RECIPIENT
```

En caso de reintento usar otro nombre de destino vacío (p. ej. `respaldo-dev-002`). La **clave identity.txt debe mantenerse separada del respaldo**, en almacenamiento privado y recuperable; perderla impide descifrar. El archivo de clave no se publica, adjunta ni sube a un drive sin cifrado propio.

**Nota:** no guardar la URL/password en archivos `.env`, logs o gestor no cifrado; `read -s` evita eco de la contraseña pero la variable de entorno sigue siendo sensible en el proceso local. Preferir un dispositivo exclusivo del operador y cerrar la sesión al finalizar.

## Qué sigue siendo obligatorio para cerrar #175

Exportar de verdad (aún **no ejecutado**), corroborar usuarios/identidades Auth, migraciones, políticas, ajustes Auth Hook, Vault y Edge, y efectuar **restore real en otra instancia autorizada** con configuración y credenciales apropiadas. Los dumps PostgreSQL no contienen bytes Storage. El 31/10/2026 DEV tiene 0 objetos, pero volver a inventariarlo en la fecha de exportación. No activar D024–D075 ni envíos a terceros antes de revisar la prueba de recuperación.

Pruebas de desarrollo: `tests/unit/mvp027-private-backup-d075.test.mjs` con subprocesses sintéticos (versiones, matching recipient, fail closed sin exportar, flags de cloud, permisos de identidad y errores de descifrado). **Nunca se conecta a Supabase real desde CI.**

Fuentes: Supabase Backup Docs https://supabase.com/docs/guides/platform/backups ; CLI local https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore ; age-keygen -y https://manpages.debian.org/experimental/age/age-keygen.1.en.html .
