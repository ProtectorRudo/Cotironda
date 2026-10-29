# Rol limitado del backend — Etapa 01

**Objetivo:** separar la cuenta del portal de `postgres` y `service_role`, que tienen facultades mucho más amplias.

La migración `supabase/changes/01_backend_role.sql` prepara `cotironda_app` como **NOLOGIN, NOBYPASSRLS, NOINHERIT**. Únicamente permite SELECT e INSERT en organizaciones, membresías, perfiles e historial privado de altas. Tiene RLS explícita, no puede UPDATE/DELETE, leer productos, contactos, ni Auth.

La función transaccional existente sigue con **SECURITY INVOKER** y se le concede ejecución al rol nuevo. Se elimina el permiso explícito de invocación de `service_role`. La función confía en que el servidor haya verificado `p_user_id` contra Supabase Auth; por eso **no** se considera seguro dar acceso directo a navegadores ni clientes externos.

`cotironda_app` permanece SIN LOGIN: ningún secreto se creó ni se transfirió a Vercel. Habilitar login requiere revisión independiente, contraseña segura creada fuera del código y conexión TLS verificada. Mientras tanto `COTIRONDA_REGISTRATION_ENABLED=false`.

La migración incluye dos índices para claves foráneas indicadas por el asesor de Supabase. Su ejecución se prueba en PostgreSQL aislado en CI y luego en `cotironda-dev`. No se ejecuta sobre Viralio ni TeHiceEsto.
