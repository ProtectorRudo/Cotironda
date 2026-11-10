> **Actualización ADR 346 (05/11/2026):** la confirmación formal de catálogo ya NO es requisito para **invitar a cotizar** a un proveedor con consentimiento y productos registrados. Se conserva la marca real `catalogue_confirmed_at` sin inventarla y se siguen validando identidad, zona, existencia de la línea y cambios de precios. Ver [docs/346](346-mvp224-invitaciones-con-catalogo-registrado-sin-friccion.md). La restricción anterior en este documento queda sustituida solo para invitaciones.

# Cotironda IA Central — MVP222: publicador controlado (sin activar)

Fecha 05/11/2026. Continuación técnica de docs/340–343, plan #597.

## Diagnóstico del sistema previo

`invitations` contiene los triggers `enqueue_on_invitation`,
`mvp092b_supersede_prior_invitations` y `z_mvp099_partial_invite`.
El primero encola WhatsApp automáticamente; los dos últimos manejan
sustitución y líneas filtradas de documentos históricos.
Una nueva ronda de IA no puede reutilizarlos indiscriminadamente:
la clasificación libre no tiene `family_code`, y el PDF legacy de texto
incluye todos los ítems del pedido, aun de rubros ajenos.

## Cambio

- Nueva migración `supabase/piloto/mvp222_ia_despacho_seguro_sin_activar.sql`.
- Tabla privada `ai_dispatch_gate_mvp222`: **enabled=false por defecto**;
  no hay endpoint público de activación. Se requiere mantenimiento SQL
  de operador autorizado para habilitar después de probar.
- Tabla privada `ai_dispatch_jobs_mvp222`, una fila única por
  (ronda,proveedor), con estados pending→leased→api_accepted/uncertain,
  sin reintentos automáticos ni duplicados; RLS, sin acceso de navegador.
- `queue_invitation_whapi_v1` se altera únicamente para hacer
  early return al detectar `ai_shadow_requests_mvp221`, conservando
  funcionalidad legacy en todas las rondas anteriores.
- `cotironda_piloto_ia_publish_mvp222`: bloquea cuando gate OFF,
  cuando transporte está OFF, comprador no autorizado, fuente original
  distinta, rondas vencidas, artículos sin rubro, falta de cobertura,
  catálogo sin confirmación, proveedor revocado, localidad diferente,
  línea de catálogo cambiada o más de 25 ítems PDF. **Solo después**
  inserta invitations, invitation_lines y ai_dispatch_jobs en una
  única transacción. Entonces pasa draft→prepared.
- `cotironda_piloto_ia_claim_mvp222`: toma un único trabajo con
  `FOR UPDATE SKIP LOCKED`, valida autorización y entrega lease.
- `cotironda_piloto_ia_pdf_snapshot_mvp222`: usa exclusivamente los
  artículos de ese proveedor que asignó IA y ya verificó Supabase.
  Formato compatible con generador PDF de solicitudes existente:
  `requestId,city,deadlineIso,deliveryNote,items[]`.
  Requiere trabajo leased con token de lease correspondiente.
- `cotironda_piloto_ia_finish_mvp222`: registra aceptación o entrega
  incierta una sola vez, sin repetir envíos. `api_accepted` de Whapi
  significa aceptación por API, NO confirmación de lectura.

## Cobertura de las pruebas

`supabase/tests/ci/mvp222-ia-despacho-pg17-rollback.sql` parte de la
ronda MVP221 de una obra con cemento, pintura y cable, y aplica
MVP222 en PostgreSQL17 sintético. Comprueba que: por defecto no se
publica la ronda; la activación **solo simulada dentro de ROLLBACK**
permite insertar tres invitaciones y tres jobs; los triggers viejos
no insertan nada en whapi_outbox; cada lease obtiene exactamente
un PDF con un artículo pertinente; cada finish se registra una vez;
una nueva llamada no reclama mensajes finalizados; OFF apaga claim;
service_role sí puede ejecutar funciones, público no.

## Aún no está activado

1. La migración NO se instala automáticamente por merge. Ningún
   secreto de Whapi ni catálogo comercial real se modificó.
2. Falta que el nuevo webhook invoque las funciones del publicador
   tras interpretar el mensaje y verificar el buyer, con límites de
   tokens durables, deduplicación HMAC y manejo de incertidumbre.
3. Falta despachador Whapi controlado por feature flag de Edge que use
   el lease + snapshot, valide el destinatario y registre estado.
4. Falta que respuesta del proveedor se asocie por `whapi_message_id`
   del nuevo dispatch, y que los presupuestos anónimos se muestren
   y comparen por rubro sin comparar totales parciales.
5. Falta consentimiento/confirmación real de catálogo según el proceso
   aprobado. Los catálogos actuales de Ailín y Nahuel tienen líneas
   cargadas, pero `catalogue_confirmed_at` permanece NULL.
6. Falta prueba E2E real del comprador y dos proveedores del piloto,
   y control de cierre/originales. **No cerrar #529 ni #597**.

## Decisión de seguridad

Una IA puede interpretar y planificar sin lista de palabras rígidas.
Pero **no puede escribir directamente a la cola Whapi** ni inferir
el consentimiento de un proveedor: cada envío requiere un servidor
que verifica fuente, catálogo, identidad y estado en el instante
de ejecutar. A diferencia de la IA, Postgres debe fallar cerrado.
