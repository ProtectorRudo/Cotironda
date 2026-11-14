# Cotironda V2 — Publicación PILOTO PARCIAL, 12/11/2026

**Autorización:** usuario dijo «Publicalo», interpretación acotada a **PILOTO** con todas las funciones comerciales V2 desactivadas. **NO se desplegó producción, no se enviaron mensajes, no se creó un comprador Auth y no se revelaron presupuestos.** Proyecto Supabase `cotironda-piloto` / `ilggkalaafhtiysyzlmg`. Código fuente PR #828 commit `a94344ac39776085b0b31eef7abb54c945ab249c` (7/7 Actions CI SUCCESS) y su cadena de dependencias PR #816–#827.

## Hecho y verificado en la base real

Se ejecutaron y registraron como migraciones de Supabase **solo estas seis, en orden**:

1. `cotironda_v2_02_quoted_reference_off` — `supabase/piloto/v2_02_ref_codigo_pedido_solo_lectura.sql`
2. `cotironda_v2_02_media_reference_off` — `supabase/piloto/v2_02_referencia_caption_adjunto_solo_lectura.sql`
3. `cotironda_v2_03_responders_consent_disabled` — `supabase/piloto/v2_03_catalogo_respondedores_privado.sql`
4. `cotironda_v2_03b_originals_audit_disabled` — `supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql`
5. `cotironda_v2_04b_analysis_private_disabled` — `supabase/piloto/v2_04b_analisis_original_idempotente_privado.sql`
6. `cotironda_v2_07_buyer_auth_check_private` — `supabase/piloto/v2_07_buyer_auth_bootstrap_check_private.sql`

**Verificación posterior SQL, solo lectura:**

- **9/9 funciones V2 nuevas instaladas**, **4/4 tablas nuevas privadas**.
- **0** funciones nuevas ejecutables por `anon` o `authenticated`; **9/9** ejecutables por `service_role`; **0** tablas nuevas con SELECT público o RLS deshabilitado.
- `v2_original_share_policy.enabled=false` (**kill switch OFF**).
- `v2_supplier_original_consents=0`, `v2_original_analysis=0`, `v2_original_download_audit=0`; `auth.users=0`.
- **7 rondas históricas** preservadas, sin escribir ni cerrar rondas.
- Se conservaron las restricciones originales 3–7 días y NO se instaló el reloj comercial de 2 días hábiles V2-05 (migración altera restricciones/trigger histórico, requiere otra revisión).

**Nuevo Supabase Edge instalado exclusivamente en PILOTO:** `cotironda-piloto-v2-pdf-reader`, versión **1**, `ezbr_sha256=8bf6e8daf30b37a5c656b9ca516c48f8f832045b3767c416fe2a247cfa82522a`. Función separada de WhatsApp, con `verify_jwt=false` y secreto servidor **obligatorio** en el handler. El secreto nuevo no fue configurado y no hay ninguna bandera de análisis habilitada: el lector NO puede procesar PDF para un comprador real todavía. La prueba E2E HTTP del lector no se pudo completar desde la herramienta local sin acceso de red; la función aparece `ACTIVE` y el código fue ensayado con unpdf sintético por CI, pero **no equivale a prueba operativa real**.

**Webhook vivo Whapi:** `cotironda-piloto-whapi` permanece **v76**, SHA `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e`, **no se reimplementó ni sobrescribió**. Otras Edges antiguas no se tocaron.

**Supabase Security Advisors tras instalar:** dos familias WARNING preexistentes: extensión `pg_net` en public y siete funciones `SECURITY DEFINER` antiguas ejecutables por `authenticated`; **ninguna de las nueve V2 nuevas** está en ese conjunto. Las tablas privadas V2 tienen RLS sin políticas públicas (esperado). Evaluar warnings heredados por separado, sin aflojar reglas para acelerar V2.

## Bloqueo para Vercel — portal NO desplegado

Intenté `create_deployment` de la rama GitHub `feat/v2-07-bootstrap-comprador-auth-seguro-20261112` en el **proyecto correcto** `cotironda-portal-dev`, commit `a94344ac39776085b0b31eef7abb54c945ab249c`, con objetivo no producción. **Vercel devolvió HTTP 402 `api-deployments-free-per-day`** (límite del plan en ese día). No se creó deploy.

Intenté registrar variables SOLO de Preview de la rama, comenzando con flags OFF y claves publicables, nunca secretos, pero Vercel devolvió **HTTP 400: “Project cotironda-portal-dev does not have a connected Git repository.”** No se creó ninguna variable ni conexión Git. El proyecto sigue con Preview protegido por SSO; no se alteró el acceso existente ni se promovió una versión a producción. No hay CLI Vercel autenticada disponible localmente, y sería incorrecto sortear el límite del plan creando proyectos o desplegando fuera del entorno solicitado.

**En consecuencia: no existe URL nueva verificada para el portal V2 y no se puede afirmar que el arquitecto vea cotizaciones.**

## Próximo paso, sin volver a reinventar la arquitectura

1. **Desbloquear Vercel**: resolver límite de despliegues del plan y conectar adecuadamente el repositorio `ProtectorRudo/Cotironda` al proyecto `cotironda-portal-dev` comprobando que la rama de trabajo vaya a Preview con SSO (nunca producción). Esta acción de usuario/plataforma es el bloqueo externo inmediato. Sin saltar el límite ni elevar gasto sin autorización.
2. Configurar en Preview las variables de Supabase PILOTO y **flags OFF**, con claves privadas server-only en el gestor de secretos de Vercel y el secreto compartido del lector Edge. No pegar claves en chats ni GitHub. Verificar commit SHA exacto al construir.
3. Crear la primera cuenta Auth de arquitecto solo tras comprobar el comprador Whapi y con onboarding `phone_confirm:false`; validar **SMS OTP real** y sesión vigente antes de cualquier visualización. La cuenta no se creó en esta publicación.
4. Registrar consentimiento V2 **prospectivo y comprobable** de los dos proveedores para exhibir nombre y originales al comprador. No inferir consentimiento de WhatsApp genérico ni de respuestas históricas.
5. Activar gradualmente la política/flags en PILOTO y probar un PDF y Excel **originales** con asociación fuerte a la ronda, SHA binario y análisis individual; ante fallo de IA, original siempre descargable.
6. Completar distribución V2 por catálogo de productos (D013), calendario oficial 2 días hábiles a las 18:00, cierre, informe general y E2E comprador→dos proveedores. Las migraciones V2-05 y cambios al Edge Whapi v76 **NO se aplicaron** en esta publicación parcial.

**Criterio de aceptación pendiente:** hasta que todos los pasos anteriores tengan resultados reales, el piloto V2 **NO está 100%**. La PR #815 y el Issue #794 son los puntos de continuidad para una conversación nueva.

## Rollback/contingencia

Todo lo nuevo se mantiene aislado y con política OFF; no hay tráfico nuevo permitido por Auth/consentimiento V2. Ante anomalía, dejar `v2_original_share_policy.enabled=false` y no activar banderas ni nuevos secretos. Si hiciera falta remover las nuevas funciones o tablas, crear un rollback explícito en GitHub, validar referencias y auditoría antes de cualquier `DROP`; nunca borrar históricos ni tablas antiguas por urgencia. Ninguna migración antigua fue revertida ni eliminada.

**Commits:** SQL original proviene de PRs #816–#828, SHA de integración de código `a94344ac39776085b0b31eef7abb54c945ab249c`; este registro se incorpora solo al PR documental #815. **No hubo merge de los PR funcionales ni deploy web exitoso**.
