# 155 — MVP-035: ejecutar respaldo cifrado DEV con un solo comando privado

31/10/2026 · Issue #283 · rama `feat/mvp-035-backup-interactivo-local`.

## Qué se simplificó

D075 ya valida exclusivamente el proyecto `qkercsoqhehbenbbncwk`, crea cinco piezas SQL cifradas con age en PostgreSQL17 y comprueba su descifrado. No se reimplementó el motor. Un asistente pequeño `scripts/ops/backup-dev-asistido.sh` prepara en una **computadora privada** las rutas y la identidad age, solicita una única vez la cadena privada sin eco y llama a D075.

Desde el directorio raíz del repositorio, Linux, macOS o WSL usando filesystem propio (no carpeta sincronizada), con Node >=22.16, cliente PostgreSQL 17 (`pg_dump`, `pg_dumpall`, `psql`) y `age`/ `age-keygen` instalados:

```bash
bash scripts/ops/backup-dev-asistido.sh
```

El programa **no descarga herramientas ni abre navegador**. Para conseguir la cadena de conexión, entrar al proyecto `cotironda-dev` en Supabase → Connect, obtener **Session pooler puerto 5432** o conexión directa y agregar `sslmode=require`. Escribirla solo al pedido oculto en la terminal; **no pegarla en ChatGPT, mensajes, issues, repositorio, capturas o terminal grabada**. No ejecutar con `bash -x`, `CI`, Docker/GitHub Actions/Vercel, teléfono ni cloud IDE.

En una primera ejecución genera `$HOME/.cotironda-keys/identity.txt` (llave privada que **no** sobrescribe en posteriores ejecuciones) y un paquete nuevo cifrado en `$HOME/.cotironda-backups/respaldo-dev-XXXXXXXX`. La clave **debe guardarse por separado** del respaldo, en un medio privado y recuperable: si se pierde, no se puede descifrar. Un error deja el gate cerrado. El comando no crea proyectos Supabase, no genera gasto IA y no dispara WhatsApp.

**Salida válida de D075:** `ENCRYPTED_SQL_EXPORT_DECRYPTED_NOT_RESTORED`, `encrypted_sql_files=5` y un SHA-256 de manifiesto. Se recomienda conservar el hash por separado. El asistente indica también dónde se creó el paquete. **NUNCA** interpretar esta salida como restore certificado: `restore_verified=false`, `gate_d024_open=false`.

## Pruebas y límites

`tests/unit/mvp035-backup-interactivo-local.test.mjs` ejecuta la sintaxis Bash sin importar secretos, modo ayuda, rechazo de argumentos, CI, GitHub, Vercel y falta de terminal privada, y verifica uso de D075 sin otro exportador. Las pruebas son **sintéticas**: no se hace backup real ni se lee la clave. El motor D075 cuenta con pruebas propias de versiones, cifrado, destinatario y descifrado, también sintéticas. Los tests normales del repositorio y CI PostgreSQL17, Next, PostgREST deben seguir aprobados.

**Pendiente indispensable #175:** ejecutar realmente desde PC autorizada, custodiar copia externa, hacer restore en instancia aislada y comprobar 17 migraciones, RLS/roles, Auth/Storage, extensiones, Vault y Edge, sin activar cron/IA/Whapi. El backup SQL **no incluye bytes Storage ni configuración externa**. Restaurar el SQL administrado de Supabase y D020 sin revisar sus efectos puede ser peligroso: nunca ejecutar un restore automático sin auditoría específica. El objetivo del asistente es solo obtener la copia SQL cifrada, no abrir el piloto.

## Costo y autorización

Sin nueva factura, infraestructura ni dependencias npm. No se fusiona `main` ni se modifica Vercel, Supabase DEV/PROD o DNS por agregar este archivo. CI validado es prueba de código, no de recuperación auténtica.
