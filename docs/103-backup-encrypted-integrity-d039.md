# 103 — D039: integridad local de respaldo cifrado de DEV

**31/10/2026 · Issue #180 · PR apilado sobre D038/#179. Estado: no hay backup real ni restore verificado.**

## Propósito

Supabase DEV (cotironda-dev, ref qkercsoqhehbenbbncwk, Free) conserva 17 migraciones. D038 reconstruye SQL de calidad IA en PostgreSQL descartable y no reemplaza un backup real. No instalar D024 ni abrir licitaciones hasta restaurar DEV en un entorno separado y certificar recuperación.

D039 agrega un comprobador **local, offline, sin dependencias, sin llamadas a Supabase y sin descifrado**: scripts/ops/verify-encrypted-dev-backup-d039.mjs.

El programa exige cinco exportaciones SQL cifradas con age y nombres precisos: roles.sql.age, schema.sql.age, data.sql.age, history_schema.sql.age y history_data.sql.age. Rechaza faltantes, archivos inesperados o SQL en claro dentro del paquete, enlaces simbólicos en toda la ruta, enlaces duros, permisos locales inseguros y encabezados age ausentes. D040 suma comprobación de propietario y cambios detectables durante la lectura. En modo seal guarda manifiesto JSON con SHA-256 y tamaño de cada fichero, fecha y ref DEV. En verify exige el SHA-256 **original del manifiesto previamente guardado por separado**. No puede comprobar que el fichero age se descifre realmente: su encabezado puede falsificarse.

**Importante:** ambos modos devuelven explícitamente restore_verified=false y gate_d024_open=false. Un PASS sólo acredita coherencia local de archivos cifrados con un manifiesto original, no su contenido, origen ni restaurabilidad. Un atacante con control del paquete y del hash externo puede sustituir ambos.

## Exportación futura, en un equipo de confianza

No ejecutar esto dentro de GitHub Actions ni trasladar backups, contraseñas, claves o hashes de usuarios al chat. El equipo debe contar con CLI Supabase actual, Docker, age y un volumen cifrado local fuera de carpetas sincronizadas. Descubrir flags reales con supabase db dump --help. Verificar primero que la conexión sea exclusivamente al proyecto DEV.

La guía oficial de Supabase para respaldo lógico y conservación de historial prescribe comandos de este tipo, con DB_URL obtenido de un gestor seguro de credenciales local (nunca guardado en Git):

~~~bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
~~~

Verificar los resultados y errores de los cinco comandos. Cifrar cada archivo con age usando una clave pública cuya clave privada sea independiente, custodiada y probada. El uso de una URL con password en argumentos de proceso expone riesgo en equipos compartidos: no imprimirla ni dejarla en historial o logs. Los SQL temporales en discos SSD pueden persistir tras un borrado; operar en almacenamiento cifrado y evitar copias/sincronización inadvertidas.

Poner **únicamente** los cinco archivos .age en un directorio propio, fuera del repositorio. **D040 exige equipo y filesystem POSIX (Linux/macOS o WSL sobre filesystem Linux), directorio privado 0700, propietario actual y cada fichero .age en 0600; ninguna ruta padre puede atravesar symlink y no se permiten enlaces duros.** Utilizar `umask 077` antes de crear los archivos, comprobar que el destino NO sea sincronizado ni compartido y asignar permisos 0700 al directorio y 0600 a las cinco exportaciones cifradas. Ejecutar desde la raíz de Cotironda:

~~~bash
node scripts/ops/verify-encrypted-dev-backup-d039.mjs seal /ruta/segura/paquete-dev
# Copiar el valor manifest_sha256 a un registro de confianza SEPARADO del paquete.
node scripts/ops/verify-encrypted-dev-backup-d039.mjs verify /ruta/segura/paquete-dev MANIFEST_SHA256
~~~

El programa crea cotironda-dev-backup-d039.manifest.json con permiso 0600 y no lo sobrescribe. Conservarlo junto a los cinco .age, pero conservar su hash separado. No subir ni siquiera los metadatos del paquete al repositorio público. D040 comprueba permisos POSIX, propietario, hardlinks, symlinks en ancestros y estabilidad de tamaño/inodo/fechas durante el cálculo. No resuelve ataques concurrentes de otro proceso del mismo usuario (TOCTOU): utilizar equipo de confianza y directorio sin otros escritores.

## Verificaciones indispensables que D039 NO realiza

1. **Auth:** usuarios, identidades, sesiones, hooks y configuración. Verificar el alcance real de cada dump y la preservación de identidades. El dump CLI estándar no equivale a copiar toda la plataforma.
2. **Storage:** los bytes de los objetos no se restauran desde una copia SQL de sus metadatos; exportar y recuperar objetos con procedimientos específicos.
3. **Vault:** cifrado y claves pueden ser incompatibles al restaurar en otro proyecto; realizar rekey de forma segura, jamás revelar valores.
4. **Extensiones, cron, Edge Functions, ajustes y dominios:** inventariar por separado. Evitar clones físicos con trabajos activables; pg_cron cero, control IA OFF y WhatsApp apagado.
5. **Restore genuino aislado:** restaurar con red/automatizaciones desactivadas, verificar integridad SQL, versiones y contenido de 17/17 migraciones, roles, RLS, Auth, Storage, Vault y flujos de acceso autorizados y denegados. Nunca restaurar sobre el DEV original.

No se cerrará el bloqueo #175 hasta contar con respaldo y restauración reales; el E2E Auth y el control alojado de permisos D025 son gates separados.

## Pruebas D039

Dieciocho escenarios Node con datos íntegramente sintéticos: caso válido, archivo faltante, SQL abierto, cabecera falsa, archivo alterado, symlink, ref incorrecta, manifest previo, carpeta symlink, manifest faltante/corrupto y hash externo obligatorio. No utilizan datos reales, red ni contraseñas.

Fuentes: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) · [Supabase Backup and Restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [D038](102-inert-d020-restore-and-free-backup-plan.md).

## D040 — auditoría de confidencialidad local

Issue #182, PR hijo de D039: la integridad con SHA-256 no detecta respaldos legibles por otros usuarios. Se agregaron seis casos sintéticos: directorio 0755, fichero 0644, enlace duro, symlink en un directorio padre, manifiesto 0644 y modo 0600 correcto. La herramienta **no** hace respaldo real ni descifra/valida age. El objetivo sigue siendo únicamente detectar prácticas inseguras antes de procesar los artefactos fuera de GitHub; la ausencia de permisos en Windows nativo causa fallo cerrado.
