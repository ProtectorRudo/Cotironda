# Cotironda V2 — publicación segura de sesiones privadas prospectivas (D016)

**Fecha:** 13/11/2026 · **Entorno:** Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`, PostgreSQL 17). **Alcance:** infraestructura SQL privada, sin envíos ni originales y sin desplegar Vercel.

## Publicación verificada

- **Migración real:** `20261113230828`, `cotironda_d016_portal_buyer_session_prospective_only_pilot_20261113`. `apply_migration` informó `success=true`.
- **Fuente GitHub:** `supabase/piloto/v2_d016_portal_prospective_session_guard_CANDIDATE.sql` en [PR #843](https://github.com/ProtectorRudo/Cotironda/pull/843).
- **Guard previo:** base `postgres` PG17, exactamente 7 rondas históricas (1 preparada), cero tickets y sesiones D016, tres políticas comerciales OFF, ninguna evidencia de originales, 5 RPC originales con firmas esperadas y ACL público denegado.
- **Corrección:** `issue_ticket_private`, `claim_ticket_private`, `claim_session_private`, `session_context_private` y `prepare_whapi_link_private` exigen `v2_business_policy.enabled=true`, `activated_at IS NOT NULL` y `request.created_at>=activated_at`. Mantienen las firmas y comprobaciones de comprador, canal, cookie, caducidad, revocación y ronda. La política OFF también invalida sesiones emitidas anteriormente.
- **No se reemplazó el webhook v76 ni se entregó un enlace**. Se conserva el mecanismo sin SMS/email, mediante ticket único de WhatsApp y cookie segura del servidor.

## Postrelease comprobado DIRECTAMENTE en Supabase

| Verificación | Resultado |
|---|---|
| Rondas conservadas | 7 (1 preparada) |
| Tickets / sesiones D016 | 0 / 0 |
| Negocio / originales / cierre | OFF / OFF / OFF |
| Funciones con nuevo guard | 5/5 |
| Funciones accesibles a `anon` y `authenticated` | 0/5 |
| Funciones accesibles a `service_role` | 5/5 |
| Emisión con comprador inexistente | `false` |
| Canje sin ticket válido | `false` |
| Lectura sin sesión válida | denegada |

## Pruebas de desarrollo

[GitHub workflow D016 sin SMS — run 43524626869](https://github.com/ProtectorRudo/Cotironda/actions/runs/43524626869): **SUCCESS**. El fixture PostgreSQL 17 `supabase/tests/ci/v2-d016-portal-prospective-session-pg17.sql` ejecutó el SQL nuevo junto a los casos históricos. La primera prueba detectó que el comprador sintético quedaba dado de baja a propósito por el test anterior; se corrigió solo el fixture, sin debilitar SQL. La siguiente ejecución pasó el flujo de sesión y el escenario negocio OFF, vuelta histórica, ronda nueva, aislamiento, activación nula y permisos, todo en `BEGIN/ROLLBACK`. Los controles generales del último HEAD deben comprobarse independientemente antes de cualquier fusión o despliegue.

## Bloqueo de publicación del portal

La metadata actual del proyecto Vercel exacto `cotironda-portal-dev`, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`, contiene variables de Preview D016 generales pero **carece** de `COTIRONDA_D016_HMAC_KEY_HEX` y `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`. Se inspeccionaron **solo nombres, objetivos y tipos**, con `decrypt=false`; no se descargaron ni publicaron secretos. Con esas dos credenciales ausentes, `puertaWhatsappPortalD016` no habilita la sesión. Las credenciales deben configurarse únicamente en el servidor/Preview, con una única clave HMAC acordada con la Edge del piloto, sin reutilizar la clave AES histórica.

El último Preview READY sigue usando `64b8573`, con SSO activado; la pantalla f985 aprobada tiene reintento exclusivo programado después de la cuota Vercel, sin modificar PR #843 ni producción.

## Próximos bloqueantes y criterio de piloto 100 %

1. Completar y cotejar secretos privados en el proveedor de servicios; el usuario no tiene que configurar SMS o aplicaciones en su teléfono.
2. Desplegar en un entorno de prueba seguro el overlay Whapi D016 preservando el webhook v76 y la idempotencia, con flags OFF mientras se verifica.
3. Revisar la autorización legal para comunicar originales (Ley 25.326) y adaptar funciones privadas de lectura/worker/revocación.
4. E2E con comprador y dos proveedores autenticados: solicitud por productos de catálogo → WhatsApp del comercio → respuesta PDF/Excel/texto → enlace privado del arquitecto → análisis e informe al cierre. **No declarar terminado sin esa prueba.**

[Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [P0 #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [PR #843](https://github.com/ProtectorRudo/Cotironda/pull/843).
