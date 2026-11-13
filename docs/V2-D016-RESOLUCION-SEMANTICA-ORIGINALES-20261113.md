# Cotironda V2 / D016 P0 — Resolver evidencia de presupuestos con IA Central MVP291

**Fecha:** 13/11/2026, Argentina. **Estado:** candidato de migración, sin publicación comercial ni webhook. Rama apilada sobre [PR #841](https://github.com/ProtectorRudo/Cotironda/pull/841).

## Bloqueo reproducido en el piloto real (SOLO LECTURA)

Una cotización original de texto ya vinculada por IA Central figura en `ai_supplier_links_mvp225.association='semantic_unique_mvp291'`, con `status='awaiting_semantic_review'`. La fuente de `whapi_inbox` tiene la misma ronda, proveedor y SHA, y la solicitud estaba vigente al recibirla. En el momento de recepción había **dos pedidos efectivamente enviados al proveedor**. La IA comparó los materiales dos veces, con controles deterministas y decisión `reason='double_model_unique_margin'`, luego guardó `selected_request_id` en `ai_supplier_auto_correlation_mvp291`; `ai_supplier_unresolved_mvp237` conserva `state='ambiguous_round'` porque es el estado del problema original, pero `resolved_request_id` sí coincide y `resolved_at` está registrado.

El guard D016 existente rechazaba **incondicionalmente** esa etiqueta histórica `ambiguous_round`, aun después de haberse resuelto. No se debe eliminar la verificación para resolverlo: hay que corroborar de forma independiente los seis registros.

## Cambio propuesto

Archivo SQL `supabase/piloto/v2_d016_original_semantic_mvp291_proof_CANDIDATE.sql`:

1. Función auxiliar **privada y sin permisos de navegador** `cotironda_piloto_privado.v2_d016_semantic_resolution_proven` que valida: mismo mensaje, proveedor, ronda, SHA, etiqueta `semantic_unique_mvp291`; estado `awaiting_semantic_review`; histórico originalmente ambiguo con `resolved_request_id` correcto y fecha válida; decisión IA `linked`, `selected_request_id` idéntico, SHA igual, `reason='double_model_unique_margin'`, tiempos coherentes; no otros vínculos conflictivos.
2. Amplía el conjunto de valores de `v2_d016_original_reply_evidence.association` para conservar literalmente `semantic_unique_mvp291` en la evidencia, sin reescribir `ai_supplier_links` ni documentos.
3. Actualiza **prospectivamente** las funciones D016 de observación y entrada para aceptar esta clase únicamente con `quoted_whapi_id IS NULL` y auxiliar validado. La obligación de aviso previo, política V2 activa, respuesta dentro de plazo, identidad de WhatsApp, revisión del archivo SHA y revocación continúa intacta.
4. Una respuesta registrada devuelve **`verified_reply_not_authorization`**. Es solo prueba técnica de procedencia, no consentimiento legal, autorización del proveedor ni permiso de descarga. Si falta un requisito, deniega sin efectos.

## Pruebas y criterios

`supabase/tests/ci/v2-d016-original-semantic-mvp291-pg17.sql`: sintético, PostgreSQL 17, `BEGIN/ROLLBACK`, con dos rondas enviadas al mismo proveedor, ambigüedad inicial y selección por IA; niega decisión aún en revisión, hash distinto, solicitud seleccionada distinta, razón no corroborada, mensaje reenviado, ID citado equivocado y replay. Comprueba revocación posterior, ausencia de permisos públicos y preservación de asociación. No se envían WhatsApps ni se usa OpenAI en estas pruebas.

**No instalar ni activar** hasta revisión de CI completa y guard previo sobre Supabase piloto. Aunque se instale con las tres políticas V2 OFF, faltarán revisión legal conforme Ley 25.326, correlación real del webhook v76, acceso privado de comprador y prueba E2E con un arquitecto y dos proveedores.

[Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [Bloqueo #838](https://github.com/ProtectorRudo/Cotironda/issues/838).
