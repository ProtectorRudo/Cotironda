# Decisión 394 — Copia móvil cifrada de Cotironda, MVP269

**06/11/2026. Autorización: «Luz verde» = desarrollo y pruebas; no publica la web ni extrae datos reales.**

## Objetivo y alcance

Que el propietario **solamente descargue desde el celular un archivo ZIP**, sin ejecutar PostgreSQL, Supabase CLI, Docker ni recibir contraseñas por este chat. La extracción y cifrado deben hacerlos **un operador de confianza / runner privado** antes de ofrecer la descarga. No ejecutar copias de producción o de clientes en GitHub Actions, Vercel serverless, herramientas públicas ni el teléfono.

Se desarrolló el empaquetador `scripts/ops/package-pilot-mobile-mvp269.mjs`. Trabaja **solo con seis exportaciones ya cifradas con age**, desde un directorio privado en un equipo Linux/macOS confiable:

- `roles.sql.age`, `schema.sql.age`, `data.sql.age`: roles, estructura y filas PostgreSQL.
- `history_schema.sql.age`, `history_data.sql.age`: historial de migraciones Supabase.
- `storage_objects.tar.age`: **bytes originales de Storage**, separados de sus metadatos SQL. Se exige un artefacto presente, pero **no basta con eso para demostrar completitud**.

El ZIP es un **contenedor sin contraseña** cuyos seis archivos internos están cifrados con age. Por eso **no se pueden leer las cotizaciones con un extractor ZIP común**. Conservar la identidad/clave de descifrado en un lugar seguro, diferente del ZIP; un link o ZIP filtrado no debe permitir acceso al contenido. No llamar a este ZIP «protegido por contraseña»: es cifrado de los archivos internos, no contraseña del contenedor.

Se genera `mobile-manifest.json` de información pública mínima: nombres fijos, SHA-256, tamaños, fecha y referencia fija de PILOTO `ilggkalaafhtiysyzlmg`. Se incluye en el ZIP. **Nunca incluye** URL de base, API keys, nombres, teléfonos, materiales, presupuestos, hashes de usuarios o documentos. El empaquetador etiqueta explícitamente `source_verified:false`, `storage_coverage_verified:false`, `restore_verified:false` porque la sola presencia de ciphertext y sus hashes no acredita ni el origen ni la posibilidad de recuperar todo. Eso se certifica aparte.

## Estado real consultado en cotironda-piloto

- Proyecto Supabase ref `ilggkalaafhtiysyzlmg`: PostgreSQL 17.11, plan Free.
- **3 rondas**, **1 bucket privado**, **6 objetos Storage**, metadatos de tamaño por un total de **302.406 bytes**. Son cifras del catálogo: **no prueba que los bytes físicos hayan sido descargados**.
- `auth.users = 0`; no existe todavía un operador humano AAL2 para habilitar link de descarga autenticado.
- Fuente: consulta SQL de solo lectura `storage.objects`, `storage.buckets`, `auth.users` y `cotironda_piloto_privado.requests`.

## Modelo de amenazas / controles

1. **No descarga el sistema de ChatGPT** ni las herramientas conectadas del contenido real. El runtime de aquí no posee un canal seguro para generar un dump completo con los bytes Storage y custodiar las claves sin exposición.
2. El script **rechaza** CI/GitHub Actions/Vercel, Windows sin filesystem POSIX, directorios no privados (0700), archivos no privados (0600), symlinks, hardlinks, carpetas dentro del repositorio y componentes faltantes o inesperados.
3. Los nombres de entrada al archivo están **cerrados**. No se permiten paths del usuario, archivos adicionales, directorios, enlaces relativos, ni empaquetar `.env` o secretos. El ZIP se escribe por stream con archivo exclusivo y `0600`, sin descifrar ni descomprimir SQL.
4. El manifest liga hashes a los seis ciphertext; después de empaquetar se reabre el ZIP y se verifica **cada componente** con hash y tamaño. Se comprueba de nuevo la fuente, para detectar cambios durante la operación.
5. Falla cerrado y elimina ZIP incompleto si el comando o la verificación falla. No sobrescribe archivo existente.
6. **No sube archivos ni crea links.** Cuando exista cuenta de operador Auth real con MFA y la copia restaurable, usar Storage privado de entregas o proveedor equivalente con URL firmada breve y autenticación de operador. Una URL firmada **no es de un solo uso** por defecto; su expiración y revocación se deben probar. El navegador del celular debe recibir solo ciphertext.
7. No confundir hash y decryptabilidad con **restore aislado real**: probar PostgreSQL, esquemas Auth, Storage, extensiones, Vault, cron, Edge, RLS/ACL y tamaño/descarga de los 6 objetos. El test de laboratorio no sustituye una restauración real de Supabase gestionado.
8. Conservar dos copias de respaldo en ubicaciones distintas, con clave separada; no dejar la única copia en un teléfono que se pueda perder.

## Contrato de entrada y ejecución futura

Esta pieza **no genera exportaciones**. Exige que un extractor privado de PILOTO, aún por implementar/ejecutar, haya creado los seis archivos ciphertext con la **referencia y los permisos correctos**. No usar `cotironda-private-backup-d075.mjs`: está diseñado para `cotironda-dev`, ref distinto, y no incluye bytes Storage.

En el host privado autorizado (no GitHub, no Vercel) y una vez obtenidas las seis piezas de forma segura:

```bash
node scripts/ops/package-pilot-mobile-mvp269.mjs seal /ruta/privada/piloto-encriptado
node scripts/ops/package-pilot-mobile-mvp269.mjs pack /ruta/privada/piloto-encriptado /ruta/privada/descargas/cotironda-piloto-cifrado.zip
```

La carpeta de salida debe ser distinta de origen y también privada. El script devuelve SHA-256 y bytes del ZIP, **sin revelar contenido**, URL ni clave. Antes de permitir un enlace para celular, una auditoría independiente debe verificar los hashes, la descarga intacta, la extracción de todos los objetos y una restauración recuperable en un destino autorizado separado.

## Criterios de aceptación

- Tests sintéticos **reales de zip/unzip**, no mocks de una UI ni bases remotas. Preservar los seis archivos cifrados byte a byte; ZIP sin entradas extra y con permisos 0600.
- Rechazar Storage faltante, archivo alterado, manifest falseado, symlinks, ficheros ajenos, CI y sobrescritura; mantener flags de fuente, Storage y restauración sin acreditar.
- El paquete solo puede denominarse `MOBILE_ZIP_ENCRYPTED_CONTENT_CANDIDATE`, **no** `backup_completo`.
- Se documentan aparte los trabajos **pendientes**: exportador PILOTO con dump consistente y descarga privada de Storage, verificación de 6/6 hashes contra bytes físicos, restore aislado, alojamiento cifrado fuera del proveedor original y link corto autenticado, prueba real en Android.

**Estado:** el empaquetado se desarrolla y prueba en GitHub; **no hay archivo real, link ni copia recuperable todavía**. Hasta completar esta cadena, la publicación de SQL permanente MVP256–267 sigue bloqueada por falta de respaldo, aunque ya se probó su transacción con rollback.
