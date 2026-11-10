# Publicación de MVP303 + MVP304 — SOLO PILOTO

**Fecha:** 07/11/2026, verificación final 08/11/2026 00:20 UTC.
**Autorización:** «Publicalo» para publicación de la versión ya probada en `cotironda-piloto` y la web de seguimiento del piloto, sin Whapi y sin otros entornos.
**Fuente de verdad desplegada:** commit `6ab1632581ca054b985a309cf71a9b85ac2831d0` de `feat/mvp174-supplier-packaging-equivalence`.

## Publicación confirmada

1. **Supabase:** proyecto `cotironda-piloto`, referencia `ilggkalaafhtiysyzlmg`. Migraciones aplicadas con éxito, registradas bajo los nombres:
   - `mvp303_revelar_todos_proveedores_al_cierre_piloto`;
   - `mvp304_contactos_consentidos_proveedores_cierre_piloto`.
   Nuevas RPC `cotironda_piloto_all_suppliers_closed_mvp303(text)` y `cotironda_piloto_all_supplier_contacts_mvp304(text)`. Ambas son `SECURITY DEFINER` con `search_path=''`, `EXECUTE` revocado a `PUBLIC`, `anon`, `authenticated`; permiso otorgado solo a `service_role`. Tablas nuevas en esquema privado con RLS.
2. **Edge de seguimiento:** `cotironda-piloto-seguimiento`, **v25 ACTIVE** (anterior v24), `verify_jwt=false` preservado porque el receptor hace validación independiente por enlace de comprador. Bundled 29 archivos: conserva los 27 módulos del seguimiento anterior e incorpora fuente de Edge nueva + módulos de validación MVP303 y descifrado MVP304. `cotironda-piloto-whapi` no se desplegó ni modificó.
3. **Vercel:** **proyecto** `cotironda-seguimiento-vista-piloto`, **deployment** `dpl_85FEqz2eZkEjPsXKd9HMThpX9aiw`, **READY**, target `production` **dentro del proyecto piloto solamente**. Código exacto del commit arriba, alias activo: `https://cotironda-seguimiento-vista-piloto.vercel.app/`. No se tocó otra app, dominio principal ni proyecto comercial.
4. **Comprobación HTTP real por conector Vercel:** `GET /` → 200 HTML, explica la identidad de todos al cierre; `GET /site.js` → 200 y contiene lista y «Contactar por WhatsApp»; `GET /api/estado` → 405 Method Not Allowed (exige POST). Alias y SHA del deployment corroborados.
5. **Base de datos en modo seguro:** `all_supplier_reveal_activation_mvp303.enabled=false`, `activated_at=NULL`. El despliegue no identifica nombres de rondas anteriores ni actuales. **Sin activación prospectiva, las nuevas rutas devuelven `not_found`/`not_ready` y el comportamiento existente no cambia.** No se solicitó ni realizó activación del gate.
6. **Contactos:** cero consentimientos específicos vigentes `contact_reveal_consents_mvp109`. No se divulgaron números; cuando corresponda, solo se revelarán si cada proveedor envió `COTI CONTACTOS SI` con canal y material cifrado correcto, sin revocación.
7. **Mensajería:** el antiguo `finalist_activation_mvp113` sigue OFF, su outbox tiene 0 filas, el cron ya existente de cierre sigue activo (1 job). No se reinstaló Whapi ni se generaron envíos.
8. **Auditoría SQL** tras publicar: RPC 303/304 existen y ejecutan solo como service_role; RLS nuevo verificado; `public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64))` devuelve `not_found` con gate OFF y contactos devuelve `not_ready`.

## Evidencia de pruebas prepublicación
- [PR #697](https://github.com/ProtectorRudo/Cotironda/pull/697), 18/18 checks, MVP303 19/19; PostgreSQL17: 3 proveedores invitados, 2 cotizaciones verificadas, 1 no entregada; nombres solo tras cierre válido.
- [PR #698](https://github.com/ProtectorRudo/Cotironda/pull/698), 19/19 checks, MVP304 21/21; PostgreSQL17: 0/1/2 consentimientos, revocación, token ajeno y rollback. WebCrypto: 4 contactos de prueba descifrados sin top 2.
- **No** equivale a E2E genuino Whapi → ronda nueva → proveedor → oferta → página → cierre; Whapi aún sin servicio activo.

## Pendiente para habilitar el uso comercial
- **Activación prospectiva OFF:** antes de crear una nueva ronda cuyo revelado se pretenda comprobar, aprobar y registrar el texto/aviso de participación que comunica expresamente la publicación posterior del nombre comercial para compradores de esa ronda; recién entonces activar la compuerta prospectiva. Esto no se hace retroactivo.
- **WhatsApps:** obtener consentimiento real específico de cada proveedor desde canal autenticado o flujo equivalente, por `COTI CONTACTOS SI` (revocable por `COTI CONTACTOS NO`). Sin consentimiento se muestra nombre pero no número.
- **Prueba real:** reactivar servicio WhatsApp solo cuando se pueda asumir el costo, generar nueva ronda y verificar el flujo completo con comprador y proveedores consentidos. No fingir esa prueba a partir de la simulación.
- **Hallazgos de advisor**: al final hubo 156 INFO `rls_enabled_no_policy` (esquemas privados bloqueados por RLS), 1 WARN `extension_in_public`, 7 WARN `authenticated_security_definer_function_executable` anteriores; requieren revisión separada. Las RPC nuevas se probaron no ejecutables por `anon`/`authenticated`. [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

## Criterio «Publicalo» aplicado
El target Vercel es técnicamente `production` pero **del proyecto piloto dedicado**, nunca producción de Cotironda. Se publicaron código y RPC; **no** se activaron nuevas divulgaciones, no se alteraron consentimientos/secretos, no se autorizó compra, registro ni notificación.
