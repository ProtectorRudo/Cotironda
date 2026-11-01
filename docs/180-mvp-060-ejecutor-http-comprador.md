# 180 — MVP-060: ejecutor HTTP privado para procesar pedidos de WhatsApp

**01/11/2026 · Issue #333 · únicamente código y CI, SIN despliegue ni envío.**

## Qué se desbloquea

MVP-059 compuso el procesamiento de la cola cifrada de pedidos: D082 → D077 → D073 → D081 → D071. Faltaba una manera concreta de **ejecutar el worker** cuando el entorno piloto esté listo.

Se incorporó una nueva ruta Node.js `POST /api/integraciones/whapi/procesar` que:
- exige PREVIEW exacta de `integration/mvp-piloto-20261031`, con `COTIRONDA_BUYER_WORKER_ENABLED=true` y `COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED=true`, sin habilitar registro abierto;
- verifica `x-cotironda-worker-key` contra **secreto de trabajador separado del webhook de Whapi**, en tiempo constante, ANTES de cargar el driver de DB;
- no recibe cuerpo ni parámetros: no permite elegir canal, empresa, datos ni SQL desde HTTP; ejecuta como máximo **3 trabajos** por tick;
- devuelve únicamente contadores de tareas/estados y `mensajesEnviados:0`; nunca teléfonos, pedidos, catálogo, empresas o tokens;
- abre cinco sesiones SQL Postgres.js **reservadas** (no pooled transaction) para cinco puertos estrictamente distintos, TLS con CA explícita verificada y host/ref de DEV; cierra en éxito/fallo;
- reutiliza el broker cifrado D029/D042 para descifrar texto con AAD y autenticación AES-GCM, nunca lo reemplaza por un `JSON.parse` inseguro.

## Roles SQL D090

`supabase/sql/whapi_buyer_worker_logins_d090.sql` crea usuarios LOGIN **sin contraseña**, sin superusuario, sin BYPASSRLS, sin herencia y con un único rol SET permitido. Cada conexión tiene su propia cadena de acceso y puede invocar solamente las RPC de su puerto; la lista de SQL sigue cerrada por MVP-059.

| Puerto | LOGIN | Rol permitido |
|---|---|---|
| cola D082 | `cotironda_buyer_worker_cola_login_d090` | `cotironda_buyer_queue_gateway_d082` |
| lectura D077 | `cotironda_buyer_worker_lectura_login_d090` | `cotironda_buyer_gateway_d076` |
| zona D077 | `cotironda_buyer_worker_zona_login_d090` | `cotironda_buyer_zone_gateway_d077` |
| ronda D081 | `cotironda_buyer_worker_ronda_login_d090` | `cotironda_whapi_round_gateway_d081` |
| invitación D071 | `cotironda_buyer_worker_invite_login_d090` | `cotironda_invite_gateway_d070` |

El PG17 CI `supabase/tests/ci/137_whapi_buyer_worker_roles_d090.sql` comprueba contraseñas NULL, memberships, ausencia de permisos directos y que se puede cambiar únicamente al rol correcto. **Ningún SQL D090 instalado en Supabase DEV histórico.**

## Configuración futura privada (NO configurar antes de #175)

Todas las variables son privadas de **Vercel Preview** y no se usan `NEXT_PUBLIC_*`:

- `COTIRONDA_BUYER_WORKER_ENABLED`, `COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED`: ambas en true tras aprobación/plan piloto.
- `COTIRONDA_BUYER_WORKER_SECRET`: cadena aleatoria propia de al menos 32 caracteres, **diferente de** `COTIRONDA_WHAPI_WEBHOOK_SECRET`. Solamente el scheduler privado la usa.
- `COTIRONDA_BUYER_WORKER_DB_DRIVER_ENABLED=true`, `COTIRONDA_BUYER_WORKER_DB_PROJECT_REF=qkercsoqhehbenbbncwk`, `COTIRONDA_BUYER_WORKER_DB_ROOT_CA_PEM`: CA PEM verificada desde Supabase.
- Cadenas de conexión independientes: `COTIRONDA_BUYER_DB_URL_COLA`, `_LECTURA`, `_ZONA`, `_RONDA`, `_INVITACION`. Cada una requiere el LOGIN D090 de su puerto y Session pooler en puerto 5432 o conexión directa por 5432, **nunca administrador, postgres o transaction pooler 6543**.
- Claves AES/HMAC de D083/D029 y `COTIRONDA_WHAPI_CHANNEL` iguales a la línea central de Whapi, inyectadas solamente en backend. No guardarlas en GitHub, screenshots ni chats.

**NO hay scheduler configurado**: esta ruta deberá invocarse de forma autenticada por un ejecutor que no divulgue secretos, con control de concurrencia, costo y estado de salud. Un WhatsApp web entrante solo almacena el inbox y crea job, no llama ni invoca este endpoint automáticamente. La cola no se procesa mientras la ruta esté apagada.

## Criterios de aceptación de la PR
- Node: no DB para GET/secret incorrecto/producción/flags apagados/bodies; flujo válido 200 sin datos privados; errores sanitizados y cierre; 5 sesiones con identidades de roles, consulta parametrizada, TLS/CA; conexiones mal configuradas, rol incorrecto o falla parcial quedan cerradas.
- PostgreSQL 17: roles D090 sin contraseña ni privilegios de tablas y SET ROLE único.
- Next.js build de portal y regresiones existentes.
- Sin Whapi HTTP saliente ni IA ni cron, sin instalar SQL DEV real, sin pasar secretos.

## Qué falta para el primer piloto con cuatro teléfonos

El bloqueo de backup/restauración de Supabase DEV histórico sigue abierto en #175. Una vez que exista entorno recuperable, instalar SQL comercial y roles D090, configurar secretos y cuatro números autorizados/catálogos por zona y conectar emisor Whapi con cuotas. Después probar texto real de arquitecto → consultas WhatsApp a tres comercios → ofertas de proveedores → ranking de rubros y revelación consentida al cierre. Los archivos PDF/Excel/imagen, cotizaciones y el ranking final siguen por verificar E2E con canal real.

**No se configuró ni ejecutó ningún cron, no se creó usuario en Supabase DEV, no se desplegó Vercel, no se conectó Whapi, no se enviaron mensajes ni se cambió producción.**
