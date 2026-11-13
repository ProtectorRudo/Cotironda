# Cotironda V2 — D016 / P0: corroboración semántica de rondas publicada en PILOTO

**13/11/2026** · Proyecto Supabase `cotironda-piloto`, PostgreSQL 17, referencia `ilggkalaafhtiysyzlmg`. **Infraestructura privada; sin activar originales, cron, mensajería ni producción**.

## Migración publicada y verificada

**Migración real:** `20261113225548` — `cotironda_d016_semantic_mvp291_proof_off_pilot_20261113`.

**Origen controlado:** `supabase/piloto/v2_d016_original_semantic_mvp291_proof_CANDIDATE.sql` del [PR #842](https://github.com/ProtectorRudo/Cotironda/pull/842). Instalación Supabase `apply_migration` confirmó `success=true`. Preflight transaccional exigió base `postgres`, PostgreSQL 17, 7 rondas anteriores con 1 preparada, tres políticas V2 apagadas, ledger de originales sin registros, firmas SQL presentes y contrato de asociación todavía sin `semantic_unique_mvp291`.

**Cambio técnico:** helper `cotironda_piloto_privado.v2_d016_semantic_resolution_proven`, privado y sin EXECUTE para `anon`, `authenticated` ni `service_role` directo, revalida el compromiso **MVP291 de dos lecturas independientes**: fuente Whapi, proveedor, ronda, SHA, resolución del histórico `ambiguous_round`, decisión `linked` con `reason='double_model_unique_margin'`, misma ronda seleccionada y fechas de confirmación, sin otros vínculos contradictorios. Se extendió el valor permitido en `v2_d016_original_reply_evidence.association` y las funciones server-only D016 de observación y registro para aceptar esta asociación solo si la corroboración pasa y **no se cita otro mensaje**. Mantienen controles de aviso prospectivo, plazo, identidad, archivo original, baja y política V2.

**Prohibición permanente:** `verified_reply_not_authorization` NO es consentimiento legal ni permiso de revelar presupuestos. No se cambió acceso del comprador, política de publicación, tokens ni original histórico. Una cotización con asociación por IA incompleta o contradictoria sigue denegada.

## Pruebas

[Workflow GitHub D016 — ejecución 43523044798](https://github.com/ProtectorRudo/Cotironda/actions/runs/43523044798): pruebas específicas `evidence` y `evidence-pg17` **SUCCESS**. Fixture sintético PostgreSQL 17 con `BEGIN/ROLLBACK`: dos solicitudes del mismo proveedor, ambigüedad inicial, resolución IA doble, SHA incorrecto, decisión sin cerrar, selección distinta, reenvío, ID citado incorrecto, replay, permiso público y revocación posterior. Verificación del rollback limpio.

**Postrelease en base real:**
- **7** rondas históricas conservadas, **1** preparada; negocio/originales/cierre **OFF/OFF/OFF**.
- Avisos específicos D016: **0**; respuestas D016: **0**; revocaciones D016: **0**.
- Nuevo CHECK para `semantic_unique_mvp291`: instalado **1**. Funciones de observación/entrada ejecutables solo por servidor, no por `anon` ni `authenticated`. Helper privado sin acceso API. Llamada NULL a recepción: `denied`.
- **1** asociación semántica histórica revisada con la función nueva: **1/1 corroborada** por seis fuentes, mientras **0** presupuestos originales pasaron a estado compartible. La política de originales está OFF.
- Security Advisor Supabase: advertencias existentes `extension_in_public` (1) y `authenticated_security_definer_function_executable` (7) requieren auditoría separada, no identificadas como cambios de este release; aviso INFO `rls_enabled_no_policy` corresponde a tablas privadas denegadas.

## Pendiente comercial y de seguridad

No se desplegó el overlay de Whapi en Edge, no se enviaron mensajes, no se crearon nuevas rondas y no se publicaron presupuestos originales. Siguen pendientes: verificación jurídica Ley 25.326 de consentimiento y cesión, correlación de metadatos de reenviado Whapi, adaptación integral de RPC de lectura/descarga/worker con revocación, acceso privado del arquitecto, credenciales seguras, prueba E2E WhatsApp del comprador y dos proveedores, y Preview de pantalla f985 bloqueado por cuota hasta su reintento autorizado. La publicación de este guard no sustituye el piloto end-to-end.

[Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [PR #842](https://github.com/ProtectorRudo/Cotironda/pull/842).
