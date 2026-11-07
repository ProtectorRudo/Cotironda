# Decisión 398 — MVP273: ensayo de recuperación aislada del ZIP móvil

Fecha: 06/11/2026. Autorización del usuario: **«Luz verde» = desarrollo y pruebas exclusivamente**. No subir archivos auténticos, no desplegar, no contratar servidor, no tocar producción ni el piloto en ejecución.

## Propósito

Cotironda ya tiene el generador ZIP cifrado (MVP269–271) y la verificación de descifrado auténtico de las seis piezas con age (MVP272). Eso no demuestra que los bytes de documentos correspondan a su índice ni que un SQL exportado pueda ejecutarse. MVP273 agrega dos ensayos desconectados y un comando que los encadena. **No reemplaza una restauración completa de Supabase administrado**.

### 1. Storage: replay byte a byte sin restaurar servicio

`scripts/ops/inspect-pilot-storage-tar-mvp273.mjs` recibe únicamente un flujo de TAR **ya descifrado**, emitido por el exportador MVP270. Analiza estrictamente encabezados USTAR, checksums de cabecera, tipo archivo regular, modo 0600, orden secuencial `objects/000001.bin...`, padding cero, índice final `objects/index.json` y dos bloques TAR de final. Rechaza enlaces simbólicos, nombres maliciosos, rutas relativas o duplicadas, índices incompletos, archivos ocultos adicionales, datos truncados o alterados, y más de 5.000 objetos / 256 MiB.

Compara el hash SHA-256 y la cantidad exacta de bytes **de cada cuerpo físico del TAR** contra los datos del índice, así como bucket, ruta, fecha e identidad de cada registro (sin imprimirlos).

`scripts/ops/audit-pilot-mobile-storage-mvp273.mjs` exige primero la auditoría MVP272 del ZIP y la identidad age, luego conecta **`unzip -p | age --decrypt | validador TAR`**. No escribe ningún PDF, Excel, imagen ni archivo TAR descifrado en disco. Recalcula el SHA del ZIP al finalizar. El resultado distingue `storage_objects_replayed` y `storage_payload_bytes` de `storage_service_restored:false`.

### 2. PostgreSQL 17: SQL a un contenedor totalmente descartable

`scripts/ops/replay-pilot-sql-lab-mvp273.mjs` exige ZIP + llave privados, SHA externo correcto y auditados por MVP272 **antes de iniciar Docker**.

Usa un Docker local que solo se conecta por el socket `unix:///var/run/docker.sock`; rechaza CI, Vercel, variables de conexión PostgreSQL y claves de Supabase. Ejecuta la imagen local `postgres:17-alpine` con `--pull=never --network=none`, **sin puertos publicados, volúmenes, bind mounts ni red**. Usa root filesystem read-only, tmpfs para los datos temporales, límites de CPU/memoria/procesos, swap desactivada y logs del contenedor deshabilitados.

Las cinco piezas SQL del ZIP son descifradas y alimentadas **por pipes** hacia `docker exec -i ... psql -v ON_ERROR_STOP=1`. El código suprime únicamente el `CREATE ROLE postgres;` redundante para un clúster recién inicializado. Nunca crea archivos SQL descifrados en el host ni conecta a Supabase real.

Exige verificar que el PostgreSQL restaurado sea v17 y existan tablas representativas del dominio `cotironda_piloto_privado.requests` y del catálogo `storage.objects`. Si falta cualquier tabla, si falla la ejecución del SQL o si el contenedor no puede eliminarse, **NO devuelve éxito**. Destruye el contenedor en `finally` aun en errores. El SQL de Supabase real puede depender de extensiones y roles ausentes en PostgreSQL vanilla y fallar este ensayo: en ese caso se reporta el bloqueo, **nunca se omiten sentencias para forzar un verde engañoso**.

`scripts/ops/verify-pilot-offline-rehearsal-mvp273.mjs` coordina validación de Storage y SQL, en ese orden. Da únicamente `PILOT_OFFLINE_STORAGE_AND_SQL_REPLAY_CHECKED_NOT_RECOVERED` y siempre mantiene `restore_verified:false`, `managed_supabase_restore_verified:false`, `mobile_delivery_ready:false` y `pilot_sql_migration_authorized_by_rehearsal:false`.

### 3. Pruebas automatizadas

- Tar sintético adversarial: fragmentación de buffers, bytes físicos con SHA no coincidente, índice mentiroso, ruta alterada, encabezado inválido, symlinks, truncado, datos extra, orden distinto y permisos de TAR.
- ZIP cifrado **con age auténtico** y Storage TAR real sintético; no se utilizan documentos de compradores.
- Contratos de arranque, desconexión, ejecución, verificación y destrucción del PG17 aislado con procesos simulados.
- Workflow adicional con imagen oficial PostgreSQL17 y SQL **completamente ficticio** cifrado con age, para demostrar arranque real del contenedor y SQL replay sin contacto con ninguna base de clientes.
- En ningún workflow se permite una URL real, `service_role`, clave privada real o un artifact de backup.

### Ejecución futura en host privado (NO realizada)

Primero el equipo privado autorizado creará ZIP de PILOTO con MVP271. Luego **retirará de su entorno** URL de BD y claves de Storage y custodiará en carpeta privada el ZIP, la identidad age y el SHA independiente. Después podrá ejecutar:

```bash
node scripts/ops/verify-pilot-offline-rehearsal-mvp273.mjs \
 /ruta/privada/descargas/cotironda-piloto-cifrado.zip \
 /ruta/privada/claves/identity.txt \
 SHA256_INDEPENDIENTE_DEL_ZIP
```

Requiere Node22+, age, unzip, Docker local con imagen `postgres:17-alpine` previamente descargada y permisos POSIX. No incluye conexión al PILOTO: **ni en lectura ni en escritura**.

### Bloqueos pendientes para un respaldo verdaderamente recuperable

1. **Ejecución privada real** de MVP271 con datos del PILOTO, guardando la identidad de descifrado fuera del ZIP.
2. Cotejar cobertura de los datos en PostgreSQL (incluyendo Auth), Vault, configuraciones y 6 archivos Storage, y que existan bytes físicos descargados para todos. Sin snapshot transaccional conjunto de SQL + Storage, documentar el intervalo de captura.
3. **Restauración real en un Supabase aislado**: tablas, funciones, roles, permisos, Auth, originales Storage y lecturas desde API, no solo replay en PostgreSQL vanilla.
4. Copia cifrada **fuera del proyecto de origen**, enlace de descarga autenticado y con caducidad breve, evidencia de descarga íntegra desde Android y política de revocación.
5. Hasta completar lo anterior, **NO abrir** la puerta de instalación persistente MVP256–267 en el piloto ni declarar las 7 etapas operativas.

**Estado:** código y pruebas en rama de desarrollo. Ningún ZIP real disponible, ningún servicio nuevo, ninguna credencial, ninguna compra y ningún dato de clientes transferido.

Referencias: `docs/394-mvp269-respaldo-zip-movil-cifrado-piloto.md` a `docs/397-mvp272-auditoria-criptografica-zip-movil.md`.
