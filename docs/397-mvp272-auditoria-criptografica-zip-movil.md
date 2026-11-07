# Decisión 397 — MVP272: auditoría criptográfica del ZIP móvil de Cotironda

**06/11/2026. Autorización:** «Luz verde», exclusivamente desarrollo y pruebas. No publicar, ejecutar copias de datos reales, contratar infraestructura ni enviar WhatsApps.

## Hallazgo que motiva el control

MVP269, MVP270 y MVP271 generan un candidato de ZIP móvil con seis componentes que **deben** estar cifrados con age. Comprobar el tamaño, la presencia de un encabezado `age-encryption.org/v1` o un SHA-256 **no prueba** que la clave del operador pueda descifrar cada archivo. Una copia inaccesible por pérdida de clave tampoco sirve como respaldo.

Se incorpora `scripts/ops/audit-pilot-mobile-ciphertext-mvp272.mjs`. En un equipo privado y confiable, realiza:

1. Valida SHA-256 del ZIP contra un valor **conservado aparte del archivo**, ficheros POSIX 0600, carpetas inmediatas 0700, sin enlaces simbólicos, no dentro del repositorio, y la clave age local en archivo propio también privado.
2. Comprueba que el ZIP contenga **exactamente** `roles.sql.age`, `schema.sql.age`, `data.sql.age`, `history_schema.sql.age`, `history_data.sql.age`, `storage_objects.tar.age` y `mobile-manifest.json`, sin entradas extra.
3. Exige manifiesto estricto del proyecto `ilggkalaafhtiysyzlmg`; compara nombres/longitudes y hashes de cada componente. No permite un manifiesto que afirme `restore_verified:true`, `source_verified:true` o `storage_coverage_verified:true`.
4. Ejecuta `unzip -p` para **cada** pieza, computa SHA-256 y transmite el ciphertext a `age --decrypt --identity`. Consume el texto descifrado en memoria sin escribirlo ni mostrarlo. Age valida la autenticidad criptográfica del contenido. Se aplica un máximo de 2 GiB de salida descifrada por componente y se rechazan bytes faltantes.
5. Comprueba de nuevo el SHA-256 y el archivo fuente después de la inspección; no conserva una copia descomprimida ni interactúa con Supabase o cualquier otra red.

La auditoría se niega a funcionar en GitHub Actions, CI, Vercel, Windows sin garantías POSIX o cuando detecta credenciales de PostgreSQL/Supabase dentro del entorno. Debe ejecutarse **separada** de la fase que tiene las credenciales vivas para exportar la base.

## Pruebas

Nuevo workflow dedicado `cotironda-mvp272-age-audit.yml`: instala herramientas `age`, `age-keygen`, `zip` y `unzip` en un runner descartable de GitHub, pero trabaja **únicamente con contenido público sintético**, una identidad age ficticia generada durante la prueba y ZIP que no representan datos reales. No guarda ningún artifact.

Pruebas negativas: SHA externo incorrecto, clave privada diferente, séptimo componente ajeno, manifiesto falso que dice `restore_verified:true`, ciphertext alterado aun cuando un atacante actualiza los hashes del manifiesto y el ZIP, permisos 0644, credenciales en proceso y ambiente cloud.

## Ejecución futura en un host autorizado

Primero generar un ZIP cifrado de PILOTO mediante MVP271 en un equipo privado que cuente con la identidad age recuperable. **Después de cerrar esa fase, borrar del proceso todas las variables PostgreSQL y credenciales Storage.** Obtener SHA-256 del ZIP y almacenarlo fuera del paquete.

```bash
# Solo después de exportar y retirar credenciales de DB/Storage del entorno.
# No copiar ni compartir aquí archivos reales, variables, claves ni SHA de identidad.
node scripts/ops/audit-pilot-mobile-ciphertext-mvp272.mjs \
  /ruta/privada/descargas/cotironda-piloto-cifrado.zip \
  /ruta/privada/claves/identity.txt \
  HASH_SHA256_DEL_ZIP_REGISTRADO_APARTE
```

El auditor responde `PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED` **solo** si las seis piezas fueron efectivamente descifradas y autenticadas por age, descartando el contenido. No revela textos, teléfonos, PDFs, Excel o contraseñas. El ZIP es un contenedor sin contraseña ZIP convencional: **cada archivo interno usa age**, y la clave de recuperación debe guardarse separada.

## Importante: lo que MVP272 NO certifica

- La auditoría **no consulta la base real** ni prueba procedencia de los SQL o de los seis archivos Storage. El hash externo prueba integridad **respecto del valor registrado**, no que el origen sea auténtico.
- No ejecuta SQL restaurado, no comprueba que un servicio Supabase gestionado se pueda recrear, ni devuelve documentos a un bucket aislado. `postgres_replay_verified:false`, `storage_objects_restored:false`, `managed_supabase_restore_verified:false`, `restore_verified:false` son obligatorios.
- No prepara servidor, no guarda la copia fuera del proveedor, no genera enlace para Android, no crea cuenta con MFA y no declara `cotironda-piloto` operativo. Sigue sin existir un ZIP auténtico descargable.
- Un respaldo recuperable real requiere **ejecución de MVP271 fuera del cloud compartido, comparación de bytes de Storage, prueba de restauración en instancia aislada y copia cifrada offsite**, con custodia de la clave. Solo después puede evaluarse publicar las migraciones MVP256–267.

## Estado posterior a «Luz verde»

Desarrollo y prueba criptográfica reproducible. Ninguna ejecución real sobre clientes, ningún cambio permanente en Supabase, Vercel, cron, WhatsApp o producción. Siguiente bloqueo operativo: disponer de un **host ejecutor privado** con credenciales/identidad guardadas correctamente, que no está provisionado por esta rama.

Referencias: `docs/394-mvp269-respaldo-zip-movil-cifrado-piloto.md`, `docs/395-mvp270-export-storage-privado-para-movil.md`, `docs/396-mvp271-respaldo-piloto-cifrado-un-comando.md`.
