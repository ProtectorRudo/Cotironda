# Cotironda V2 / D016 P0 — Recepción de originales: publicación privada en piloto

**Fecha: 13/11/2026** · Supabase exclusivo PILOTO, proyecto \`cotironda-piloto\` (\`ilggkalaafhtiysyzlmg\`). **Sin publicación del webhook, sin mensajes y sin efectos en producción.**

## Publicación real

- Migración aplicada y registrada por Supabase: **\`20261113202332\`**, \`cotironda_d016_original_inbox_evidence_off_pilot_20261113\`.
- Fuente SQL: \`supabase/piloto/v2_d016_original_whapi_inbox_CANDIDATE.sql\` del [PR #841](https://github.com/ProtectorRudo/Cotironda/pull/841).
- Guardia de aplicación en la misma transacción: Postgres >=17, 7 rondas históricas (1 preparada), políticas negocio/originales/cierre todas OFF, ledger de avisos/respuestas/revocaciones sin registros, RPC antigua de observación presente y funciones nuevas inexistentes. **\`apply_migration success=true\`**.
- Añadidas dos funciones SQL \`SECURITY DEFINER SET search_path TO ''\` con \`EXECUTE\` solo para \`service_role\`: \`cotironda_piloto_v2_d016_record_reply_event_private\` y \`cotironda_piloto_v2_d016_revoke_by_whapi_text_private\`.
- Primera función no acepta un request_id o supplier_key del navegador: deduce un único proveedor/ronda a partir de \`whapi_inbox\`, \`ai_supplier_links_mvp225\` y aviso registrado; exige estado \`api_accepted\`, ID citado exacto o única ronda, fuente SHA y guard existente. Retorna únicamente \`verified_reply_not_authorization\` o \`denied\`.
- Segunda función solamente revoca después de verificar el SHA del texto **NO COMPARTIR** desde el mensaje Whapi realmente guardado y el mismo proveedor/chat. Revoca el aviso para todas las rondas de ese proveedor que estén asociadas al chat; no ofrece descarga ni envía un WhatsApp.

## Pruebas

GitHub [workflow de evidencia D016](https://github.com/ProtectorRudo/Cotironda/actions/runs/43500937733): **Node SUCCESS, PostgreSQL 17 sintético/ROLLBACK SUCCESS, tipo Deno del webhook temporal de salida + entrada SUCCESS**. Incluye prueba de negativa por chat ajeno, ID Whapi incorrecto, reenvío, falso precio, duplicado, PDF almacenado, BAJA y ACL anon/auth.

SQL postrelease realmente consultado en el proyecto correcto:
- 7 rondas históricas, 1 preparada.
- Política negocio OFF; originales OFF; cierre OFF.
- Nuevas tablas previas: 0 avisos, 0 respuestas y 0 revocaciones. Esta migración no carga datos.
- Las dos nuevas RPC: \`anon=false\`, \`authenticated=false\`, \`service_role=true\`.
- Dos pruebas negativas reales con entrada NULL: \`record_reply_event_private\` devuelve \`denied\`; \`revoke_by_whapi_text_private\` devuelve \`0\`.
- Migración registrada como \`20261113202332\`.

## Código candidato (NO desplegado)

La implementación de entrada está en \`original-reply-intake-d016.ts\`, conectada mediante \`scripts/piloto/v2-d016-original-inbox-overlay.mjs\` que genera una copia temporal del webhook v76 histórico. Nuevo interruptor independiente \`COTIRONDA_PILOT_D016_ORIGINAL_INBOX_ENABLED\` OFF. Los archivos originales deben tener SHA y almacenamiento seguro antes de intentar vincular la evidencia. El comando \`NO COMPARTIR\` no requiere pedir número de ronda.

El webhook instalado sigue siendo v76; la última UI Preview READY de Vercel sigue en \`64b8573\` a la fecha de este control, con protección SSO. La corrección UI f985 del PR #837 se mantiene para reintento exclusivo del entorno Preview tras cuota Hobby; este PR #841 no está incluido en ese despliegue.

## Riesgos y criterios pendientes

1. La IA semántica \`semantic_unique_mvp291\` produce vínculos que esta RPC niega por diseño; **no usar equivalencia de ronda sin evidencia más estricta**. Revisar su contrato para cotizaciones de texto, archivos y concurrencia multi-proveedor.
2. Validar contra Whapi real el significado de metadatos de reenvío; no usar ausencia de flag como prueba definitiva de que no fue reenviado.
3. La respuesta a un aviso NO significa de por sí consentimiento legal válido de comunicación del original (Ley 25.326 arts. 5 y 11). Conservar originales inaccesibles hasta resolver fundamento jurídico, autorizar por ronda/proveedor y adaptar todas las RPC/worker/portal de consulta y baja. \`verified_reply_not_authorization\` nunca es permiso comercial.
4. No activar WhatsApp de pruebas hasta preparar credenciales y confirmar flujo completo bajo cambios en rama, CI y pruebas de estrés, sin duplicaciones de Whapi. El pedido se distribuye por **producto y catálogo, nunca sólo rubro**.
5. Falta prueba E2E con un arquitecto y dos proveedores, acceso privado y análisis por presupuesto e informe final. **No declarar piloto al 100 %.**

Referencia: [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838), [Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #841](https://github.com/ProtectorRudo/Cotironda/pull/841).
