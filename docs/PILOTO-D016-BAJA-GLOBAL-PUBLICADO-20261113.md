# Cotironda V2 — Acta de publicación D016 / P0: «NO COMPARTIR» global

**Fecha local:** 13/11/2026 · **Migration version UTC:** \`20261114015943\`. **Entorno:** Supabase \`cotironda-piloto\` (\`ilggkalaafhtiysyzlmg\`), PostgreSQL 17.11.0.011. **NO es producción.** No se desplegó el webhook WhatsApp ni el portal.

## Hallazgo corregido

La RPC anterior \`public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private\` registraba una baja únicamente en \`v2_d016_original_notice_revocations\` por cada ronda previamente avisada. **No** tocaba el consentimiento global \`v2_supplier_original_consents.revoked_at\` y devolvía cero si no existían avisos, por lo que futuras rondas podían reutilizar una autorización de originales que el proveedor había intentado retirar.

## Cambios reales publicados

Migración Supabase **\`20261114015943\`**, nombre **\`cotironda_d016_global_original_optout_off_pilot_20261113\`**, aplicada con \`success=true\` desde el SQL versionado \`supabase/piloto/v2_d016_global_original_optout_CANDIDATE.sql\` en [PR #845](https://github.com/ProtectorRudo/Cotironda/pull/845).

- Se agregó la tabla privada \`v2_d016_supplier_original_optout_events\`, append-only por HMAC entrante, FK al \`whapi_inbox\`, \`RLS ENABLED\` y **sin SELECT directo** para \`anon\`, \`authenticated\` ni \`service_role\`.
- Se actualizó, **con la misma firma**, la RPC privada \`revoke_by_whapi_text_private(text,text)\`, \`SECURITY DEFINER\`, búsqueda vacía, \`EXECUTE\` exclusivo de \`service_role\`: verifica emisor supplier y chat Whapi auténtico, texto exacto por SHA; inserta el evento de baja, revoca el consentimiento global **aunque no exista ronda ni aviso** y registra la baja de todos los avisos previos de ese proveedor. Los reintentos del mismo evento son idempotentes.
- El trigger privado \`v2_d016_guard_original_reconsent\` serializa por fila del proveedor y **rechaza recuperar una autorización anterior** a la última baja. Solo un consentimiento genuinamente posterior puede reactivar nuevas rondas, sujeto al alta legal futura.
- No se modifica la participación del proveedor ni sus respuestas previas. No se crea consentimiento, no se abre el acceso a originales, no se altera el contacto del cliente y no se manda ningún mensaje nuevo.

## Verificación de integración sintética

[GitHub Actions D016, run 43543664303](https://github.com/ProtectorRudo/Cotironda/actions/runs/43543664303) **SUCCESS**, log explícito \`D016_GLOBAL_OPT_OUT_PG17_PASS\` y \`ROLLBACK\`, PostgreSQL 17; fixture \`supabase/tests/ci/v2-d016-global-original-optout-pg17.sql\`.

Escenarios: baja con aviso (revoca consentimiento y ronda), baja **sin ninguna ronda/aviso** (revoca consentimiento global), mismo chat y SHA exacto, otro chat, cuerpo arbitrario, nulos, doble webhook, tabla sin acceso público, permiso service_role de RPC, bloqueo de reconstrucción retroactiva, aceptación nueva posterior y nueva baja con auditoría preservada. **No se usaron datos personales, OpenAI ni mensajes reales**.

La prueba no garantiza todavía el envío/recepción real de Whapi ni sustituye las pruebas del comprador en el navegador.

## Preflight estricto y poscontrol REAL

El preflight transaccional exigió: PostgreSQL 17 y base \`postgres\`, 7 solicitudes históricas (1 preparada), 3 políticas V2 OFF, **0** consentimientos de originales, 0 avisos/respuestas/revocaciones, tabla y trigger aún inexistentes, forma y permisos exactos de la RPC anterior.

Después de aplicar, se consultó directamente la base:

| Comprobación | Resultado |
|---|---|
| Solicitudes totales / preparada | **7 / 1** (intactas) |
| Consentimientos de originales | **0** |
| Avisos / respuestas / bajas por ronda | **0 / 0 / 0** |
| Eventos de baja global | **0** |
| Flags negocio/originales/cierre | **OFF / OFF / OFF** |
| Trigger contra consentimiento retroactivo | **1 instalado** |
| RLS de tabla privada | **true** |
| Lectura directa anon/auth/service | **false / false / false** |
| Ejecución de RPC service_role | **true** |
| Ejecución de RPC anon | **false** |
| RPC con parámetros nulos | **0 / no efecto** |
| Función nueva comprueba consentimiento global | **true** |

La lista de migraciones de Supabase confirma \`20261114015943\`. No se ejecutó el webhook en producción, ni se alteraron las 7 rondas.

## Bloqueantes restantes para piloto end-to-end

- La tabla \`v2_supplier_original_consents\` todavía contiene cero registros. Es necesario acreditar el **consentimiento prospectivo e informado una sola vez por proveedor** para la cesión de archivos con datos personales, con términos revisados según Ley 25.326, arts. 5/6/11, y mantener revocación fácil. Esto puede integrarse en un único paso de alta; **no hace falta una confirmación por cada cotización**. No crear consentimientos implícitos o retroactivos.
- Dos credenciales server-only siguen ausentes en Vercel Preview \`cotironda-portal-dev\`: \`COTIRONDA_D016_HMAC_KEY_HEX\` y \`COTIRONDA_PILOT_SUPABASE_SECRET_KEY\`. No exponer valores en GitHub, chats ni frontend.
- La corrección visual f985 tiene un reintento exclusivo de Preview ya programado después de cuota Vercel. No duplicar despliegue ni cambiar el proyecto autorizado.
- Falta desplegar con seguridad la integración WhatsApp D016 (sobre v76 histórico inmutable), registrar el alta prospectiva, y probar con comprador + dos proveedores la recepción del original, guía breve y cierre final.

[PR #845](https://github.com/ProtectorRudo/Cotironda/pull/845) (DRAFT) · [P0 #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [Plan #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **El piloto aún NO está al 100 %.**
