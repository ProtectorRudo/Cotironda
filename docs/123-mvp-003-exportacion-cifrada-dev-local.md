# 123 — MVP-003: exportación cifrada de Supabase DEV, operada localmente

31/10/2026 · Issue #175 · PR #221 · **Herramienta preparada; NO se ejecutó contra Supabase DEV**.

## Objetivo

El bloqueo real es extraer un respaldo auténtico de cotironda-dev y recuperarlo fuera del proyecto. La herramienta `scripts/ops/export-encrypted-dev-mvp003.mjs` ejecuta cinco lecturas PostgreSQL 17 y cifra cada flujo directamente con age, sin escribir SQL legible: roles sin contraseñas, esquema, datos, esquema de migraciones y datos de migraciones. Produce los cinco archivos `.age` esperados por D039 y sella un manifiesto SHA-256. El hash se guarda separadamente.

Reutiliza `validateDevDsn` de D041, por lo que solo acepta el proyecto DEV exacto, puerto 5432 y TLS explícito. Descarta parámetros URI imprevistos; la contraseña se pasa a libpq mediante variables de entorno y no por argumentos ni logs. Usa `default_transaction_read_only=on`, exige cliente `pg_dump`/`pg_dumpall` versión 17 y una carpeta privada POSIX 0700 fuera del repositorio y vacía. Un fallo cancela la exportación, borra piezas incompletas y no entrega manifiesto válido. No incluye ni ejecuta SQL de restauración, migraciones, WhatsApp, IA ni producción.

## Ejecución local (Linux o Ubuntu WSL2 en equipo privado)

Requisitos: Node >=22, cliente PostgreSQL 17, binarios oficiales `age` y `age-keygen`. Trabajar en la rama del PR #221. No subir contraseñas, URL, SQL, clave privada, dumps o capturas de estos datos a GitHub ni al chat. No usar Windows nativo ni una carpeta sincronizada con la nube.

1. Crear fuera del repositorio una carpeta local privada y una identidad age. La clave privada debe conservarse separada de la copia:

```bash
umask 077
mkdir -p -m 700 "$HOME/cotironda-seguro"
age-keygen -o "$HOME/cotironda-seguro/identity.txt"
export COTIRONDA_AGE_RECIPIENT="$(age-keygen -y "$HOME/cotironda-seguro/identity.txt")"
```

2. En Supabase → proyecto **cotironda-dev** → **Connect**, obtener la cadena directa o **Session pooler** puerto 5432. Verificar que contiene `sslmode=require` (o verify-ca / verify-full). No utilizar transaction pooler puerto 6543, ni escribir la cadena en un comando que quede en el historial.

3. Desde la raíz local del repositorio, ingresar la cadena sin eco y exportar:

```bash
read -rs -p 'Cadena privada de Cotironda DEV: ' COTIRONDA_DEV_DB_URL; echo
export COTIRONDA_DEV_DB_URL
node scripts/ops/export-encrypted-dev-mvp003.mjs "$HOME/cotironda-seguro/dev-$(date +%Y%m%d-%H%M%S)"
unset COTIRONDA_DEV_DB_URL
```

El programa imprime un objeto que incluye `manifest_sha256`, `restore_verified:false` y `gate_d024_open:false`. Guardar el SHA en un registro privado **fuera del paquete**, sin compartir el dump ni la clave. Para ejecutar una prueba de descifrado real de los cinco archivos con D041:

```bash
node scripts/ops/check-local-dev-backup-d041.mjs decrypt /ruta/privada/dev-FECHA MANIFEST_SHA256 "$HOME/cotironda-seguro/identity.txt"
```

Guardar la copia cifrada además en almacenamiento externo privado, **separada de la identidad age**. No declararla restaurable hasta el siguiente control.

## Límites de seguridad y próximos criterios de aceptación

- Los cinco dumps son lecturas independientes, no una instantánea transaccional global; exportar con DEV sin escrituras ni automatizaciones y contrastar los inventarios antes/después.
- La copia SQL **no contiene los bytes de Storage**. Tampoco certifica restauración de Auth gestionado, Vault (clave raíz), cron/pg_net, Edge Functions, configuración OAuth ni roles internos de Supabase. Estos componentes requieren inventario y ensayo complementarios.
- Los dumps pueden contener definiciones SQL que ejecutan acciones al restaurar. Revisarlos antes de hacerlo: la migración histórica D020 contiene `DROP EXTENSION pg_net`. No restaurar ciegamente ni en un destino con red o automatizaciones habilitadas.
- CI usa sustitutos de subprocess y contenido sintético para comprobar 10 escenarios: flujo de cinco piezas, secreto fuera de argv, destino incorrecto, opción de conexión adicional, recipient inválido, cliente antiguo, fallo parcial y carpeta insegura/ocupada. **Estos tests no ejecutan dump ni age reales de DEV**.
- Gate #175 permanece abierto hasta exportación cifrada real, descifrado local, restauración en clúster independiente, verificación de las 17 migraciones, RLS y datos, e inventario de Auth/Storage/Vault. No instalar D024+ en DEV ni modificar producción.

Referencias: https://supabase.com/docs/guides/platform/backups · https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore · https://www.postgresql.org/docs/17/app-pg-dumpall.html.
