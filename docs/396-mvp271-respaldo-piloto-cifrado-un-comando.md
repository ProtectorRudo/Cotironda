# Decisión 396 — MVP271: extracción SQL cifrada PILOTO y comando único del respaldo móvil

**Fecha:** 06/11/2026. «Luz verde» para desarrollar y probar. **Sin extracción real, migración persistente ni publicación.**

## Objetivo

Completar el código del proceso privado que prepara **un solo archivo ZIP para descargar en el celular**, usando las piezas previas:

- MVP269: ZIP de seis archivos previamente cifrados con age; manifiesto y SHA-256.
- MVP270: TAR cifrado de bytes de los archivos privados Storage, con inventario de objetos antes/después y hashes por archivo.
- **MVP271:** cinco exportaciones SQL con snapshot PostgreSQL 17 compartido, únicamente en `cotironda-piloto`, más un único comando que ejecuta la cadena completa y deja un ZIP cifrado *candidato* en un equipo privado.

## Diseño técnico

`scripts/ops/validate-pilot-dsn-mvp271.mjs` examina una URL PostgreSQL **fuera de la red**: obliga a base `postgres`, puerto 5432, TLS explícito y `ref=ilggkalaafhtiysyzlmg` en el host directo (`db.<ref>.supabase.co`) o en el usuario del pooler de sesión (`postgres.<ref>`). Rechaza cualquier otra referencia, usuario, base, SSL ausente, puerto inesperado, parámetros extra, fragmento y DSN incompleta. Jamás publica la URL ni su contraseña.

`scripts/ops/export-encrypted-pilot-sql-mvp271.mjs` reutiliza las reglas robustas de `export-encrypted-dev-mvp003.mjs` pero **sin modificar DEV**: PostgreSQL17, rol separado, SQL de esquema y datos y dos archivos de historial, un `pg_export_snapshot` repetible y compartido para los cuatro `pg_dump`, `PGOPTIONS` readonly, ruta fuera del repositorio y permisos 0700/0600, tubería `pg_dump | age` sin SQL intermedio en disco. Exige identidad age privada existente cuya clave pública derivada coincide con `COTIRONDA_AGE_RECIPIENT`. No crea manifiesto extra que impida empaquetar seis componentes con MVP269. No declara restauración verificada.

`scripts/ops/create-private-pilot-mobile-backup-mvp271.mjs` ejecuta la cadena:

1. Comprobar entorno local de confianza, destino ZIP ausente y fuente **nueva, creada de manera exclusiva**, fuera del repositorio; comprobar que no hay symlinks en sus padres.
2. Generar cinco archivos SQL cifrados; verificar estado y referencia de proyecto.
3. Descargar, comprobar y cifrar Storage, sin archivos originales sin cifrar; verificar objeto/bytes y segundo inventario.
4. Sellar el manifiesto con hashes y construir ZIP, verificando los siete miembros (seis cifras y manifiesto), sin extras ni sobrescritura.
5. Devolver solamente nombre del ZIP, SHA-256, tamaño y recuentos agregados. **NO** entregar URL ni guardar claves con el ZIP.

En una falla, elimina únicamente la carpeta cifrada nueva que la operación reclamó en forma exclusiva. El empaquetador ZIP tiene control independiente de escritura exclusiva y limpieza de su propia salida: el orquestador **no borra archivos ZIP preexistentes o creados por otro proceso**. Es el comportamiento necesario cuando un sistema de respaldo debe reintentarse sin destruir otra copia.

## Operación futura, cuando exista ejecutor privado autorizado

La ejecución de la copia real **NO** se realizó en esta implementación. El host debe ser Linux/macOS/WSL POSIX de confianza fuera de GitHub/Vercel, con PostgreSQL 17 cliente, Node22+, age, age-keygen, zip y unzip. Debe contar con una identidad age privada `0600`, un directorio privado de descargas `0700`, acceso a la base vía DSN TLS y una credencial Supabase con permisos de descarga privada Storage, custodiadas en un gestor de secretos. No se entregan al teléfono ni al chat.

Variables utilizadas, obtenidas del almacén seguro **sin imprimir sus valores**:

`COTIRONDA_PILOT_DB_URL`, `COTIRONDA_PILOT_SERVICE_ROLE_KEY`, `COTIRONDA_AGE_RECIPIENT`, `COTIRONDA_AGE_IDENTITY_FILE`.

Una vez instalado y auditado el host:

```bash
node scripts/ops/create-private-pilot-mobile-backup-mvp271.mjs \
 /ruta/privada/nuevo-respaldo-piloto \
 /ruta/privada/descargas/cotironda-piloto-cifrado.zip
```

**NUNCA** ejecutar en CI, Vercel o el propio celular; esos entornos están bloqueados por contrato. No incluir claves en argumentos CLI, instrucciones en Issues ni logs. El archivo ZIP no tiene contraseña convencional: sus seis componentes internos usan cifrado age cuya identidad privada debe permanecer **separada y custodiada**. Quien conserve solo el ZIP y pierda la clave no podrá restaurar su contenido.

### Endurecimiento adicional del ZIP MVP269

Durante la integración MVP271 se encontró una carrera entre reservar el nombre del ZIP y reabrir ese nombre para escribir. Se corrigió en `scripts/ops/package-pilot-mobile-mvp269.mjs`: ahora se escribe mediante el **mismo descriptor exclusivo** `wx`, se verifica la identidad de dispositivo/inodo antes y después de auditar el ZIP y el proceso elimina **únicamente su propio archivo** si falla. Si otra ejecución reemplazó el nombre, no se borra el archivo ajeno. Se agregaron pruebas de seguridad para impedir volver a abrir una ruta con `flags:'w'`. El archivo se cierra al finalizar la tubería para evitar dejar una operación pendiente.

## Pruebas, límites y bloqueos

- Los tests usan simulaciones transparentes de pg_dump, age y Storage. El empaquetado ZIP sí se crea y verifica de verdad con bytes **sintéticos**. Las simulaciones de age **NO son cifrado real**.
- Se prueban URL de otro proyecto (incluido DEV), TLS/puerto/base inválidos, snapshot corrupto, PostgreSQL16, errores de dumps, permisos, archivos ajenos, CI/Vercel, reintentos, fallas en mitad de la cadena y carrera de archivos ZIP.
- El código de Storage verifica catálogo estable antes/después, pero no posee snapshot transaccional distribuido de Storage+SQL ni asegura que un archivo alterado durante una copia conserve igual `updated_at`; para certificar recuperabilidad hay que restaurar y cotejar bytes.
- Los dumps lógicos deben auditarse por cobertura concreta en la instancia Supabase (incluyendo Auth y configuración, RLS, funciones, extensiones, Vault y Storage metadatos): **no asumir** que una exportación SQL representa la plataforma gestionada completa.
- **No hay respaldo auténtico verificado ni host privado habilitado. No existe archivo ZIP real ni URL descargable.**
- Restan: ejecutar en host privado autorizado con herramientas y credenciales; verificar con age real y claves recuperables; restaurar base y seis objetos a un entorno *aislado*; montar entrega con autenticación fuerte, vencimiento corto y control de acceso; probar descarga Android; conservar copia adicional fuera del piloto.
- Mientras no se demuestre esa recuperación, **no** aplicar permanentemente las migraciones MVP256–267 en la base que contiene pedidos y documentos.

Estado GitHub: preparación técnica exclusivamente en rama de desarrollo, no producción ni Supabase PILOTO.

Referencias: `docs/394-mvp269-respaldo-zip-movil-cifrado-piloto.md`, `docs/395-mvp270-export-storage-privado-para-movil.md`, https://supabase.com/docs/guides/platform/backups.
