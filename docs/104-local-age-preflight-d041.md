# 104 — D041: destino DEV y descifrado local seguro

31/10/2026 · Issue #184 · PR draft apilado sobre D040/#183.

**No hay backup real de DEV ni restauración certificada.** Issue #175 sigue bloqueante para D024. No publicar ni habilitar IA, Whapi o licitaciones comerciales.

## Hallazgo

D039/D040 solo revisan SHA-256, formato de cabecera age y permisos locales. Una cabecera sintética podría pasar esos chequeos aunque el archivo no se pueda abrir. D041 agrega una prueba LOCAL de descifrado mediante binario real age y una comprobación estricta del proyecto de destino de la cadena de conexión, sin conectarse al servidor.

## Uso seguro en equipo confiable

Requisitos: Node >=22, age oficial, directorio privado POSIX 0700, cinco ficheros age 0600, identidad privada age 0600 y su ruta sin symlinks. Nunca cargar URL con password, archivo de identidad, SQL o respaldos al chat, GitHub, Issue, Actions, carpeta compartida ni nube sincronizada.

### A — Comprobar que la URL apunta a Cotironda DEV

La cadena real debe estar almacenada mediante gestor de secretos LOCAL en la variable de entorno COTIRONDA_DEV_DB_URL (no en argumentos, no en el repositorio).

    node scripts/ops/check-local-dev-backup-d041.mjs target

El comprobador solo permite la base postgres de db.qkercsoqhehbenbbncwk.supabase.co:5432 con usuario postgres, o pooler de sesión con nombre terminado en .pooler.supabase.com:5432 y usuario postgres.qkercsoqhehbenbbncwk. Rechaza otro proyecto, otra base, puerto de pooler de transacciones 6543, protocolo inesperado y parámetros explícitos de TLS inseguro. No abre red ni comprueba permisos efectivos del usuario; tampoco asegura que una extracción posterior reutilice la misma URL.

La contraseña en un argumento de proceso usado por supabase db dump puede exponerse en equipos compartidos. Inspeccionar supabase db dump --help y usar equipo exclusivo/gestor seguro. D041 NO exporta automáticamente una base.

### B — Validar descifrado de cinco archivos age ya exportados

Primero sellar/verificar el paquete por D039/D040 y conservar el hash original del manifiesto por separado. Ejecutar:

    node scripts/ops/check-local-dev-backup-d041.mjs decrypt /ruta/privada/paquete MANIFEST_SHA256 /ruta/privada/identity.txt

El operador aporta la clave únicamente a su equipo. El script revalida el hash externo por D039/D040, utiliza age --decrypt --identity para cada uno de los cinco archivos y descarta inmediatamente el flujo de SQL descifrado, sin mostrarlo ni escribirlo en disco. Si falta el ejecutable age, falla la identidad, descifrado, contenido vacío o cambian los archivos, el resultado es FAIL. La salida no contiene secretos. Al final repite la validación de integridad del paquete.

PASS significa solamente que el ciphertext existente se descifró con esa identidad y que los bytes originales siguen íntegros. **No demuestra que el dump esté completo, que el SQL sea correcto ni que exista una restauración posible.** La salida conserva restore_verified=false y gate_d024_open=false.

### C — Cobertura separada y cierre bloqueado

La guía oficial de Supabase para migraciones contempla tres dumps (roles/esquema/datos) y una exportación adicional para preservar historial supabase_migrations. La cobertura concreta de Auth depende del tipo de migración, extracción y destino: no afirmar que auth.users está incluido ni excluido sin verificar el contenido y ejecutar restore. Los bytes de objetos Storage nunca vienen dentro de dumps SQL. Revisar adicionalmente cambios personalizados en auth/storage, Vault, criptografía de columnas, pg_cron, pg_net, Edge Functions, OAuth/Auth Settings y credenciales reemitidas.

Antes de cerrar #175 son obligatorios una exportación real cifrada, descifrado real con identidad del operador y restauración aislada en ambiente compatible sin red/automatización, más pruebas de las 17 migraciones, datos, sesiones, RLS, Storage y Vault.

## Pruebas

Suite tests/unit/dev-backup-local-age-d041.test.mjs: 14 casos sintéticos de URL errónea, TLS, clave insegura, salida de descifrado y errores. **La ejecución age se simula en CI; los tests no verifican criptografía real.** La ejecución de age auténtico necesita un respaldo real que todavía no existe.

Fuentes:
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
