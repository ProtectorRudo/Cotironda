# V2-08 — Estado después de la publicación parcial y bloqueo de Vercel

Fecha de corte: 12/11/2026. **SOLO AUDITORÍA Y CÓDIGO EN ESTE PR, NO DEPLOY.**

## Hechos verificados con conectores

- Supabase PILOTO `ilggkalaafhtiysyzlmg`, PostgreSQL 17.11: **9 funciones V2 privadas** instaladas por el último release, **4 tablas privadas RLS**, política `v2_original_share_policy.enabled=false`, **0 Auth**, **0 consentimientos V2**, **7 rondas previas preservadas**. Ninguna consulta de este incremento mutó la base.
- Se comprobó la RPC **REAL YA INSTALADA** `cotironda_piloto_v2_bootstrap_buyer_check_private` contra el canal autenticado, sin obtener ni exponer teléfono ni buyer key. Resultado agregado: **1 comprador verificado de 1 elegible**, **0** combinaciones de contacto con SHA incorrecta aceptadas. **Eso NO significa que exista una sesión Auth ni que funcione el SMS.**
- Edge `cotironda-piloto-v2-pdf-reader` **v1 ACTIVE**, pero secreto privado aún no configurado para ambos servicios; por diseño no permite procesar PDFs públicamente. Edge Whapi sigue **v76** SHA `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e`.
- Vercel proyecto exacto `cotironda-portal-dev`, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`, equipo `ProtectorRudo's projects` (`hobby`), Next.js, Preview protegida por SSO. **El proyecto NO está vinculado a Git**; la prueba de crear variables específicas por rama devolvió HTTP **400** `Project does not have a connected Git repository`. Intento de `create_deployment` no produjo nueva versión y respondió **402** `api-deployments-free-per-day`.
- La herramienta Vercel `get_git_deployment_context` sí encontró **otros** proyectos Cotironda conectados a `ProtectorRudo/Cotironda`, como `cotironda` y `cotironda-seguimiento-*`. **No se seleccionaron para reemplazar el portal de desarrollo**: podrían servir producción o funciones distintas.

## Corrección técnica verificada en código

El antiguo snapshot `scripts/piloto/observaciones/v2-readiness-piloto-20261112.json` es una fotografía **anterior a la publicación** (0 funciones SQL/0 tablas) que se conserva para reproducibilidad de CI. **No volver a citarlo como estado presente**.

La nueva fotografía `scripts/piloto/observaciones/v2-readiness-piloto-postrelease-20261112.json` distingue:
- **SQL + Edge PDF instalados** pero sin usuarios, consentimientos, sesión, secreto PDF ni exposición de presupuestos.
- **Vercel Git desconectado** (`git_linked=false`) y **cuota agotada** (`deployment_quota_available=false`), con `preview_sha` histórica distinta del `release_sha` aprobado en PR #828.
- **Un comprador autenticado a nivel de canal Whapi** reconocido por la RPC privada, pero **0 compradores en Auth**; el SMS OTP sigue sin prueba real.

`scripts/piloto/v2-release-readiness.mjs` añade dos controles **necesarios pero no suficientes**: `portal_git_correcto` (repositorio Git exacto del proyecto DEV) y `vercel_cuota` (posibilidad actual de desplegar). La CI ahora tiene pruebas que nunca confunden **9 RPC y 4 tablas instaladas** con un **portal accesible**. Aunque un fixture hipotético pase, `can_publish=false` siempre y no existe código de deploy en el guard.

## Destrabe seguro, sin crear ni cambiar otros proyectos

**Acción pendiente en cuenta Vercel:** entrar al equipo `ProtectorRudo's projects` → proyecto **`cotironda-portal-dev`** → **Settings → Git** y revisar la opción de conectar el repositorio **`ProtectorRudo/Cotironda`**. Antes de confirmar, asegurar que conectar Git **no publique automáticamente un commit de main como producción**. Verificar protecciones y políticas de rama del proyecto y el comportamiento de despliegue automático. No enlazar el repositorio a un proyecto distinto ni aceptar un despliegue automático fuera del objetivo Preview. La herramienta conectada actual **no ofrece enlazar Git a este proyecto ya existente**: `create_git_project` crea o reutiliza proyectos distintos, y explícitamente no reconecta el actual.

Vercel [documenta el área de Git en ajustes de proyecto](https://vercel.com/docs/project-configuration/git-settings) y [el límite Hobby de 100 despliegues cada 24 horas](https://vercel.com/docs/limits); no es necesario contratar un plan pago como decisión automática. Una vez que la cuota esté disponible y el repositorio conectado de forma controlada, se podrá preparar un deploy **Preview** de la SHA exacta con `flags OFF` y SSO, siempre con una nueva autorización **«Publicalo»** para ese cambio de entorno.

**No configurar ni compartir secretos** en GitHub ni conversaciones. El portal requiere nuevas variables privadas Supabase y el secreto del lector PDF en servidor; antes de abrir archivos se deben comprobar Auth con SMS real, consentimientos prospectivos y asociación fuerte de originales.

## Estado de aceptación

- [x] Snapshot postrelease actualizado en GitHub con SQL/Edge instalados, Whapi intacto y Vercel bloqueado.
- [x] RPC de identidad buyer verificada **en base real**, incluido rechazo de un SHA incorrecto, sin PII.
- [ ] Test CI completo último commit del PR que agrega esta auditoría.
- [ ] Vercel proyecto DEV Git conectado y cuota disponible (acción de cuenta / plataforma).
- [ ] Portal V2 Preview protegido, exactamente misma SHA, flags OFF, sin efectos en producción.
- [ ] Primer buyer Auth con teléfono SMS verificado y consentimiento V2 de proveedor comprobado.
- [ ] Primer original verdadero visible y descargable con guía; después ronda E2E y cierre.

**Este incremento no instaló, migró, cambió credenciales, desplegó ni envió mensajes.** El estado PILOTO es parcial y el portal V2 sigue bloqueado.
