# 22 — Registro vinculado a JWT de Supabase

## Diagnóstico
El backend previo comprobaba `getUser()` pero pasaba un `p_user_id` explícito al SQL. Una conexión SQL robada podría actuar en nombre de otro usuario. Era el riesgo de suplantación pendiente de la Etapa 01.

## Solución propuesta
- `public.register_company_for_current_user(p_request_id, p_name, p_type, p_trade_name)` **no recibe user_id**; usa `auth.uid()` y `auth.jwt()` del contexto JWT del PostgREST de Supabase.
- Solo se puede invocar con el rol PostgreSQL `authenticated`, y se rechazan JWT ausentes o marcados `is_anonymous=true`.
- El propietario `cotironda_registrar` es NOLOGIN, NO BYPASSRLS y no es dueño de las tablas. La función `SECURITY DEFINER` está limitada, con `search_path='' ` y función privada de registro ya transaccional.
- Revocamos `EXECUTE` al rol legado `cotironda_app` en la función con `p_user_id` y su acceso al schema privado.
- Next.js verifica el usuario con `getUser()` y correo confirmado. Después invoca `supabase.rpc()` usando el mismo cliente SSR de esa sesión. Ni usuario, ni rol, ni ID de organización se incluyen en parámetros RPC.
- La API no usa contraseñas directas de PostgreSQL ni keys `service_role`; el interruptor de seguridad rechaza configuraciones heredadas con esos secretos.
- La función RPC de `public` es callable directamente por un usuario autenticado. **No confiar únicamente en el chequeo de correo de Next**. La política de correo verificado todavía requiere una validación independiente en la BD o un flujo alternativo cerrado antes de abrir altas reales.

## Pruebas previstas
1. CI PostgreSQL 17: función vinculada a JWT simulado, ausencia de sesión, anonimato, dos identidades y reintentos.
2. Unitarias: puerto RPC no transmite `userId`, errores no filtran detalles, config sin credenciales SQL.
3. Next.js build y smoke HTTP con registro apagado.
4. Supabase dev: ejecutar migración y suite en transacción rollback, verificar Advisors; aplicar solo si pasa.
5. **Pendiente:** E2E con JWT realmente firmado y validado por PostgREST; correo verificado, cookies, IP rate limit y políticas de seguridad para SECURITY DEFINER pública.

El portal sigue **deshabilitado**. No se fusiona este PR ni se publica producción.
