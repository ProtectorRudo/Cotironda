# 169 — MVP-049: ensayo de restauración de DEV sin red, a partir de un respaldo cifrado

**01/11/2026 · Issue #311 · NO ejecutado con datos reales de Supabase DEV.**

## El bloqueo

#175 exige una exportación cifrada real y una **restauración aislada y verificada** antes de instalar las migraciones comerciales. El asistente actual `scripts/ops/backup-dev-asistido.sh` crea las cinco piezas SQL cifradas AGE y verifica su descifrado mediante D075, pero **no demuestra que puedan restaurarse**. Este incremento prepara un ensayo de restauración sin intervenir DEV.

## Flujo local privado (no es una tarea para ejecutar desde el celular)

En una computadora de confianza con Linux, macOS o WSL, bajo un usuario no-root, desde la raíz del repositorio:

1. Completar el respaldo real con `bash scripts/ops/backup-dev-asistido.sh` si no se ejecutó antes. Registrar **en un lugar separado del paquete** el hash SHA-256 de manifiesto que imprime D075, sin compartirlo ni copiar la contraseña de base.
2. Tener Docker local y la imagen `postgres:17-alpine` descargada previamente en la máquina. El restaurador usa `--pull=never` para no intentar descargar imágenes mientras trata el respaldo.
3. Ejecutar `bash scripts/ops/restaurar-dev-aislado.sh` desde una terminal privada. La herramienta pedirá la ruta absoluta del paquete cifrado y el SHA-256 informado por D075. La clave AGE local se busca en `~/.cotironda-keys/identity.txt`.
4. Verificar que se obtenga `DISPOSABLE_PG17_SQL_REPLAY_VERIFIED` **solo si** las cinco piezas restauran, el SQL se ejecuta sin errores y se verifica un esquema mínimo. El contenedor de datos debe ser eliminado incluso si algún paso falla.

No pasar DSN, credenciales PostgreSQL, password o claves AGE por chat. **El procedimiento no necesita una URL de Supabase**: no se conecta ni escribe en cotironda-dev.

## Seguridad técnica

El programa `scripts/ops/restore-encrypted-dev-lab-mvp049.mjs` reutiliza la verificación íntegra D039 (permisos 0700/0600, no symlinks, hash de manifiesto esperado y SHA de cinco archivos AGE) y D041 (archivo de identidad privado, descifrado completo verificable). Bloquea ejecución en CI/GitHub/Vercel y rechaza variables de conexión a PostgreSQL y contextos Docker remotos.

Solo inicia **un contenedor descartable propio**, imagen fija PostgreSQL17 Alpine disponible localmente, con `--network=none`, sin publicación de puertos ni montajes de directorios del host, data directory en `tmpfs`. Verifica el readiness del contenedor, hace streaming `age --decrypt` hacia `docker exec -i ... psql -v ON_ERROR_STOP=1` y descarta stdout/stderr de SQL. No guarda SQL descifrado en el host ni imprime contenido, claves o URL. Solo omite el `CREATE ROLE postgres;` ya presente en PG17 limpio. Al finalizar destruye el contenedor.

La herramienta **falla cerrado** si falta un componente, si no puede descifrar, si el SQL falla, si el esquema no es reconocible o si no puede destruir el contenedor; nunca emite un resultado de éxito parcial. No ejecuta ningún envío Whapi.

## Limitación decisiva: SQL restaurado NO equivale a recuperar Supabase

Una restauración real podría fallar en PostgreSQL Alpine puro por extensiones/roles propios de Supabase (Auth, Storage, Vault, pgsodium, etc.), aun cuando el respaldo cifrado sea válido. Este ensayo es útil como detector temprano, **no habilita por sí mismo** las migraciones D024+ ni sustituye un laboratorio Supabase compatible.

Incluso si pasa el ensayo SQL, el resultado incluye expresamente `supabase_platform_restore_verified: false` y `gate_d024_open: false`. Los archivos de Storage, configuración Auth, secretos Edge y otros servicios externos no forman parte de estas cinco piezas. #175 permanece abierto hasta comprobar recuperación suficiente para DEV y documentar excepciones.

## Pruebas automatizadas sin datos reales

`tests/unit/mvp049-private-isolated-restore.test.mjs` simula los procesos Docker/AGE; valida orden de cinco piezas, contenedor sin red/puertos, rechazo de variables remotas, hash inválido, fallo de SQL, fallo de limpieza, ausencia de datos y filtro del rol nativo. `tests/unit/mvp049-restore-wrapper.test.mjs` verifica sintaxis Bash, ayuda, ejecución sin TTY y que una variable DEV cargada bloquea antes de pedir datos.

**Importante:** los tests simulados verifican la orquestación; **no prueban que la copia real de Supabase sea recuperable**. No se ejecutó Docker real ni se inspeccionaron archivos privados.

## Próximo paso después de recuperar DEV

Instalar las migraciones comerciales bajo plan revisado, verificar permisos de roles y conectar la ruta HTTP Whapi MVP-048 con un usuario PostgreSQL restringido, de modo que un arquitecto y dos proveedores autorizados puedan probar la primera ronda sin tocar producción. Hasta entonces: sin conexión Whapi real, sin envíos, sin publicar `main` ni dominio.
