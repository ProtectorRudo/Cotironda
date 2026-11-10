# Decisión 391 — etapa 7 / MVP267: operador humano autenticado con sesión PILOTO y MFA

**Fecha:** 06/11/2026. **Alcance:** solo desarrollo, según «dale hacelo» en continuidad con «luz verde». Sin publicar Vercel, activar cron, entregar mensajes reales, habilitar administradores, gestionar cobros ni alterar el piloto.

## Amenaza y objetivo

Los RPC internos de incidentes MVP265 y la revisión de gastos inciertos MVP266 reciben un `operator_ref` UUID. Un UUID no autentica a una persona. Ponerlos detrás de una URL que acepte ese ID sería inseguro, especialmente para liberar reservas de llamadas pagas o reconocer alertas. Se requiere la identidad de un usuario real de Supabase Auth en el **proyecto PILOTO**, sesión aún existente, segundo factor y una vinculación administrativa explícita a un operador habilitado.

## Diseño adoptado

- SQL `mvp267_operator_supabase_auth_mfa_bridge.sql`, instalado **después** de MVP264, MVP265 y MVP266, agrega `auth_user_id` único y opcional al registro privado `supervisor_operators_mvp265`. No crea usuarios, operadores, asociaciones ni activaciones. Sólo un administrador de base con autorización explícita puede vincular una cuenta humana existente y habilitar su rol `incident_manager`.
- El helper SQL interno `cotironda_piloto_privado.operator_session_mvp267` comprueba, en cada solicitud: JWT con `role=authenticated`, emisor exclusivo de `cotironda-piloto`, `sub=auth.uid()`, `aal=aal2` (MFA), fecha `exp` vigente, usuario no anónimo/no suspendido/no eliminado, identidad vinculada a un operador activo y `auth.sessions.id=session_id` existente (incluida fecha `not_after`). No usa `user_metadata`, email o teléfono como permisos.
- Las nuevas RPC públicas `...operator_queue_auth_mvp267`, `...operator_usage_auth_mvp267`, `...operator_case_action_auth_mvp267` y `...operator_usage_review_auth_mvp267` tienen `EXECUTE` únicamente para rol `authenticated` y fallan si falta vínculo/MFA/sesión. **No aceptan operator_ref como parámetro**: la identidad proviene de Auth y se resuelve en SQL. No se abre SELECT sobre las tablas privadas ni se modifica el acceso de los RPC antiguos de `service_role`.
- El backend Next.js PILOTO expone `GET /api/piloto/operador`, `GET /api/piloto/operador/uso`, `POST /api/piloto/operador/caso` y `POST /api/piloto/operador/consumo`. El backend llama `auth.getUser(jwt)` con token del operador, revalida claims y usa **exclusivamente clave publicable + JWT del usuario**. SQL vuelve a comprobar sesión y MFA al momento de cada operación. Nunca usar secret/service_role en navegador ni endpoint.
- Los cuatro endpoints están apagados hasta configurar `COTIRONDA_PILOT_OPERATOR_API_ENABLED=true` y cotejar `VERCEL_ENV=preview`, `COTIRONDA_REGISTRATION_ENABLED=false`, URL y clave publicable exclusivas del PILOTO, origen HTTPS exacto `COTIRONDA_PILOT_OPERATOR_ORIGIN` y el SHA de release aprobado `COTIRONDA_PILOT_OPERATOR_RELEASE_SHA=VERCEL_GIT_COMMIT_SHA`. No son flags que se activen en este cambio.
- Las escrituras necesitan JSON exacto de campos permitidos, timestamp, códigos cerrados, SHA de evidencia y `Origin` coincidente. No admiten parámetros `operatorRef`, URLs con query, cookies como credenciales ni body superior a 2 KiB. Respuestas y errores tienen `no-store` y lista blanca de datos, sin contactos ni originales.

## Modelo de confianza

- PostgREST verifica la firma del JWT antes de construir `auth.uid()` / `auth.jwt()`; SQL verifica además vigencia de la sesión en la tabla de Auth. Nunca confiar en el JSON de un JWT no verificado. El `getUser` HTTP confirma identidad en Auth y el RPC de SQL decide el permiso definitivo.
- `aal2` significa segundo factor realmente acreditado por Supabase Auth. Un usuario con un enlace de seguimiento, Auth DEV, sesión `aal1`, o una cuenta auto-registrada **no** tiene acceso. No hay mecanismo de `signup` habilitado por este PR.
- Los RPC de MVP265 y MVP266 siguen limitando cantidad de acciones/revisiones, mantienen idempotencia y conservan casos/consumos como fuente de verdad. El procedimiento de revisión humana no reenvía WhatsApps, no declara ganado un presupuesto ni transforma un `unmetered` en cero.
- No hay identidad por empresa en las alertas agregadas, ni se divulgan datos de compradores/proveedores. El operador es un cargo interno del **PILOTO**, no una facultad automática de ninguna empresa B2B.

## Pruebas exigidas

1. PostgreSQL 17 sintético con ROLLBACK: usuario real simulado ligado a un operador habilitado + sesión AAL2 puede consultar y registrar hechos, guardando **su** operator_ref. El mismo JWT sin MFA, la cuenta anónima, operador inactivo y una sesión eliminada quedan denegados. No se pueden leer registros privados ni suplantar un ID enviado. Los roles anon/service_role no acceden a RPC de operador.
2. Node: gate OFF, release SHA incorrecto, entorno productivo, JWT ausente, Auth inválido, query prohibida, origen cruzado, campos extra, códigos inválidos, filtración de datos, endpoint de registro de caso y conciliación monetaria desconocida.
3. Next.js y Deno/PG17/HTTP habituales: no regresiones. Fusión sólo con checks verdes del último commit. Ninguna prueba sintética equivale a MFA/Supabase real.

## Plan operativo de activación futura — aún NO ejecutado

1. Validar conexión a `cotironda-piloto`, inventario de migraciones MVP264–267, fuente de Vercel y backup. Aplicar SQL solo bajo orden explícita `Publicalo en cotironda-piloto`, con rollback probado; dejar operador inactivo.
2. Provisionar una cuenta Auth **específica del personal operador**, sin habilitar registro público; configurar y verificar MFA `aal2`. Asociar por base de datos a un único `operator_ref`, sin imprimir tokens/secretos en Issues o chat. Probar revocación/suspensión contra sesión genuina.
3. Configurar Preview y SHA exacto, origen, claves publicables, bandera inicialmente OFF. Verificar sin exposición que una cuenta normal recibe denegación y que el operador MFA accede sin service-role. Activar solo si los tests reales son correctos, registrar hora y responsables.
4. Revisar alertas sólo en lectura; probar incidente sintético/real consentido y registro de revisión sin disparar ningún mensaje. La habilitación del cron MVP263 se autorizará por separado. La conciliación de facturación OpenAI/Whapi/OCR/Supabase también es otra puerta, no completada aquí.
5. Apagar primero `COTIRONDA_PILOT_OPERATOR_API_ENABLED=false`, deshabilitar al operador SQL y revocar sesión en Auth ante un incidente. Los RPC internos y la memoria privada no son accesibles al frontend. Revertir Vercel antes que SQL si se requiere rollback.

## Estado después de implementar

**Código de autenticación de operadores e interfaz API construido en desarrollo.** No existe todavía un operador Auth real habilitado, no se instalaron las nuevas RPC en PILOTO ni se publicó Preview. La etapa 7 y el circuito completo #597/#529 siguen pendientes de prueba operativa real. Para declarar el PILOTO funcionando se exige además E2E WhatsApp→documentos→presupuestos→comparación por rubro→cierre→originales/contactos consentidos y medición de costos, con evidencias trazables.
