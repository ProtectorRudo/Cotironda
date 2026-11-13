# Cotironda V2 — Publicación controlada de SQL V2-17 y Preview Vercel

**Fecha de publicación:** 13/11/2026 ART.  
**Autorización:** «Publicalo» en el proyecto Cotironda: **solo Supabase PILOTO** y **Vercel Preview protegida**. **NO producción, NO altas/SMS, NO envíos Whapi, NO activar originales.**  
**Versión de código instalada/compilada:** commit GitHub `b591ab77033651b823caa578b95697f5a01045a1` del PR #836 (apilado sobre #835). **8/8 GitHub Actions SUCCESS sobre el SHA publicado**.

## 1. Supabase PILOTO — confirmado por consultas SQL posteriores

Proyecto: `cotironda-piloto` (`ilggkalaafhtiysyzlmg`), PostgreSQL 17.11, región `sa-east-1`.  
**Migración aplicada correctamente** mediante `apply_migration` desde el archivo exacto `supabase/piloto/v2_17_reconciliar_sql_texto_piloto_CANDIDATE.sql` de GitHub:

`cotironda_v2_17_text_sql_reconcile_guarded_pilot_20261113` — registrada en Supabase como versión **`20261113070252`**.

| Verificación real posterior | Resultado |
| --- | --- |
| `responders_private` reconoce `link.kind='text'` | **Sí** |
| `original_source_private` devuelve `authorized_text_v2` | **Sí** |
| `record_text_download` instalada | **Sí** |
| EXECUTE auditoría `service_role` | **Permitido** |
| EXECUTE auditoría `anon` / `authenticated` | **Denegado / denegado** |
| Política `v2_original_share_policy.enabled` | **false** |
| `auth.users` | **0** |
| Consentimientos originales V2 | **0** |
| Rondas históricas conservadas | **7** |
| Descargas V2 auditadas | **0** |

Ensayo SQL **sin usar IDs reales**: catálogo con sesión/empresa ficticias devuelve `NULL`; fuente original ficticia devuelve `NULL`; `record_text_download` con valores ficticios devuelve `false`. **3/3 rechazos**, sin insertar descargas.

Nuevas huellas observadas después de la migración, solo para control de deriva futura:
- Catálogo: `677212270f94ff7533f926475eb5cd82`.
- Fuente: `dcbc4afebfb6dd3786cd0df5798c3842`.

Resguardo de reversión: `supabase/piloto/v2_17_rollback_original_rpc_piloto_CANDIDATE.sql` conserva las dos definiciones **reales previas** capturadas por `pg_get_functiondef` antes de la publicación, con comprobación de política apagada y cero auditorías antes de cualquier reversión. **No se ejecutó rollback**, ni se incluyeron valores secretos o datos de participantes.

Edge Functions confirmadas posteriores:
- `cotironda-piloto-whapi` **v76 ACTIVE**, hash `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e` **sin cambios**.
- `cotironda-piloto-v2-pdf-reader` **v1 ACTIVE**, sin cambios.
- `cotironda-piloto-v2-text-reader` **v1 ACTIVE**, `verify_jwt=true`, hash `4243bbc1cabfbfd03a7f4a1d1268b584b6e3b36ee3739fc88a93a46a176a84bc`, instalada en publicación previa; **continúa inhabilitada por falta de secreto/flag de activación**.

## 2. Vercel — Preview V2 creada, compilada y READY

- Team exacto: `team_CE76WzHKVPy9e28LXIw2r3J4`.
- Proyecto exacto: `cotironda-portal-dev`, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`.
- Despliegue: `dpl_2n5zpDEMmTGzb7odRseHrWgXmRJa`.
- **URL de Preview:** https://cotironda-portal-jvdyznpd0-protector-rudo-s-projects.vercel.app
- Ref GitHub: `fix/v2-15-texto-edge-sin-clave-vercel-20261112`, **SHA exacto `b591ab77033651b823caa578b95697f5a01045a1`**.
- Proyecto Next.js, fuente solicitada con root `apps/portal`. `create_deployment` omitió `target` (default de API: **Preview**, NO producción). Confirmado `state=READY`/build logs `Build Completed` y `Deployment completed`, sin errores de build.
- **SSO: `enabled=true`, `deploymentType='all'`**. No se creó ni compartió un enlace temporal para saltar SSO.
- La cuota que antes devolvía 402 permitió este deployment. No se conectó Git permanentemente, no se publicó `main` ni se cambió otro proyecto.
- Intento de smoke HTTP directo desde el entorno de auditoría devolvió **DNS no resoluble**. Por tanto **aún NO está comprobado el acceso navegador real** (ni usuario SSO ni comprador).

Se añadieron **7 variables con destino solo `preview`** en `cotironda-portal-dev`, verificadas por nombre y scope. URL pública y servidor del Supabase PILOTO; **todos los flags V2 permanecen explícitamente en `false`** (`RESPONDERS`, `ANALYSIS`, `PDF`, `TEXT`); release SHA fijada al commit publicado. **No se instalaron secretos** y los cambios de variables hechos después de un build aplican a futuros deployments, no retroactivamente al artefacto READY.

Se comprobó también que las variables heredadas del portal siguen usando una **URL Supabase diferente** de `cotironda-piloto`; `COTIRONDA_REGISTRATION_ENABLED=false` y SSO sigue activo. **No** confundir el acceso antiguo con la futura sesión V2 del comprador.

## 3. Qué falta: NO declarar piloto comercial operativo

**Bloqueos observables**:
1. Preview V2 requiere **publishable key del proyecto PILOTO** para cliente y servidor, clave privada de servidor solo en Vercel, secreto privado del lector PDF/Edge y secreto nuevo segregado para lector textual, y OpenAI API para análisis cuando se autorice. Ninguna clave `COTIRONDA_PILOT_AES_HEX` debe salir de Supabase ni ir a Vercel. Configurar exclusivamente en el administrador de secretos, no en chat ni GitHub.
2. Supabase Auth: **0 usuarios**. Verificar operador SMS real; luego bootstrap del único arquitecto WhatsApp elegible, sin auto-confirmación y con `verifyOtp` real. El formulario V2-16 tiene fallback de primer SMS vía `resend` cuando GoTrue responde `signup_disabled` con alta pendiente.
3. Consentimiento **prospectivo** de los proveedores (0), registro de evidencia, asociación fuerte de archivos/WhatsApp a nueva ronda y activación controlada de la política solo después de comprobar los accesos. No inferir permiso de consentimientos v1.
4. Ensayo real **WhatsApp → dos proveedores → textos y PDF/Excel originales → navegador de comprador → análisis individual y general al cierre**. Probar denegación de comprador ajeno, revocación, SHA, doble mensaje y protección SSO. El build, el SQL y los negativos sintéticos **NO** sustituyen este E2E.

**Estado final de esta autorización:** infraestructura SQL publicada y Preview protegida READY; flujo comercial V2 **INACTIVO**, producción y WhatsApp histórico intactos. No usuarios, SMS, compras, consentimientos, ni despliegues a producción.

**Próximo paso:** configurar las claves y proveedor SMS en los paneles del proyecto exacto; realizar un **nuevo** deploy Preview con esas variables y todos los flags OFF; verificar Auth SMS real; solo entonces abrir el primer caso comercial bajo autorización controlada.
