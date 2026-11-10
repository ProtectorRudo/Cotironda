# MVP209 — programación autónoma del cierre comercial sin WhatsApp

Estado: **solo desarrollo**. GitHub issue #523 / checklist #529 P0-F y P0-G.
No se aplicó SQL ni se desplegó Edge en PILOTO/producción. Sin mensajes,
sin revelar contactos ni adjudicar y sin tocar los cuatro originales.

## Diagnóstico real en `cotironda-piloto`, 5/11/2026

- Cron SQL `cotironda_piloto_close_due_5min` ACTIVO, 890 ejecuciones
  correctas a las 12:25 UTC y ninguna ronda vencida entonces.
- 3 rondas `prepared` con vencimiento 6/7 de noviembre, 0 `closed`.
- `pg_cron`, `pg_net` y Vault disponibles.
- SQL source-only selector MVP196 presente; 0 planes y 0 outbox.
- Bandera `finalist_activation_mvp113.enabled=false`.
- **No** cron específico de finalistas ni secreto Vault separado para
  planificación. La bandera general de salida Whapi existente en DB
  era `true`, por lo que NO debe usarse como protección suficiente
  contra despachos.
- El cron para cierre ya funciona y no necesita ser reemplazado.

## Solución integrada, sin un segundo planificador

1. La Edge **existente** `cotironda-piloto-finalistas` acepta ahora un
   token exclusivo `COTIRONDA_PILOT_FINALIST_PLAN_SECRET` enviado en
   `x-cotironda-finalist-plan-secret`. Un token distinto
   `COTIRONDA_PILOT_FINALIST_WORKER_SECRET` sigue siendo obligatorio
   para cualquier intento de despacho. Cabeceras ausentes, duplicadas
   o contraseñas equivocadas son `401`; no se infiere privilegio de
   `body`, `query` ni del registro de un usuario.
2. La credencial de **solo planificación** ejecuta el cierre seguro y
   el selector v9 MVP196 + planificador MVP197 existente; retorna
   `planned_no_whatsapp` **ANTES** de descifrar contactos, acceder al
   outbox, leer el token Whapi o ejecutar `fetch` hacia WhatsApp.
   Sigue necesitando las dos banderas del servidor worker/selector
   habilitadas expresamente, así como la política prospectiva SQL.
3. `mvp209_finalists_plan_only_cron.sql` propone un único job de
   `pg_cron` cada 5 minutos, independiente del workflow GitHub
   `main`. La función privada con `search_path=''` se ejecuta sin
   privilegios `EXECUTE` para `anon`, `authenticated` ni
   `service_role`. No hace ninguna llamada HTTP si no hay ronda
   **nueva, posterior a la activación, cerrada y con ofertas**;
   tampoco para rondas con selección ya materializada.
4. El job no contiene credenciales: recupera en tiempo de ejecución
   de Vault `cotironda_piloto_finalists_plan_only_v1`, una cadena
   hex aleatoria de 96 caracteres. El operador debe provisionar
   **el mismo valor** en la variable privada de la Edge, **sin copiar
   el secreto a GitHub, SQL, issues o chats**.
5. `mvp209_finalists_plan_readiness_readonly.sql` es la auditoría
   previa de solo lectura: comprueba las funciones instaladas, un único
   cron de cierre, 0 cron de planificación, Vault y la bandera de
   activación. No retorna secretos, WhatsApp, HMAC ni identificadores.

## Seguridad / protección de costos

- **La cola `pg_net` puede guardar temporalmente cabeceras en claro**:
  por eso la credencial Vault de esta tarea tiene estrictamente poder
  para *planificar*, jamás para notificar. No usar la credencial de
  despacho total en el cron.
- La activación prospectiva SQL no se toca; ningún backfill.
- No debe existir un segundo planificador GitHub con facultad de
  despacho disparándose en paralelo sin revisión explícita.
- Las llamadas se acotan a **un tick cada 5 minutos** y el selector
  a diez rondas por lote, sin materializar planes duplicados. Los
  casos ambiguos pueden reconsiderarse en ticks posteriores y deben
  monitorizarse para controlar costos.
- El instalador rechaza duplicados de cron, SQL faltante y Vault
  ausente. No autoactiva ninguna bandera. La política OFF
  produce `idle_no_eligible_round`, sin invocar `pg_net`.
- Las alertas `pg_net`/cron y la reconciliación de avisos `uncertain`
  continúan abiertas; este cambio NO las suplanta.

## Pruebas

- Función pura de modo/credenciales: aislamiento de plan y despacho,
  token corto, erróneo, ausente, doble cabecera y error de comparador.
- Prueba de orden de control del worker: plan_only retorna ANTES
  de descifrado, cola, WhatsApp y uso de clave de despacho.
- PG17 **aislado y reversible**: fake local de `net.http_post`,
  cron/Vault sintéticos, 0 solicitudes con flag OFF, histórico
  anterior a activación rechazado, ronda sin presupuesto rechazada,
  ronda elegible crea una solicitud plan-only sin contactos, apagado
  posterior y Vault corrupto cancelan nuevas solicitudes; ROLLBACK.
- CI actual conserva regresiones de PostgreSQL17, Next, PostgREST y
  documentación. Los scripts reales no se instalan por las pruebas.

## Puertas restantes para cerrar P0-F

1. Auditoría de CI completa y Edge compilable; permisos de rol.
2. Autorizar explícitamente `Publicalo en cotironda-piloto` con
   una revisión exacta, no producción, y desplegar primero Edge
   con los *flags OFF*.
3. Provisionar secreto Vault exclusivamente desde canal seguro,
   sincronizar Edge, instalar el cron y verificar inicialmente
   **0** solicitudes en `net.http_request_queue` con bandera OFF.
4. Activar solo modo plan para una ronda **nueva** verificada tras
   aceptación de condiciones de alta; probar cierre, oferta, resultado,
   costo e idempotencia con tres números autorizados.
5. Los mensajes WhatsApp y la revelación de contactos permanecen
   **independientemente desactivados** hasta una autorización y prueba
   controlada de envíos. Reconciliar `uncertain`; nunca reintentar
   ciegamente.

No confundir que el cron exista en GitHub con que esté instalado
en Supabase. No marcar P0-F/G completados sin evidencia HTTP/PG17 real
y una ronda prospectiva cerrada.
