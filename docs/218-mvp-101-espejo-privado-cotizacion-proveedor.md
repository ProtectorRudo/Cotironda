# MVP-101 — Espejo privado de cotización documental del proveedor

**02/11/2026 · Issue #412 · Rama de desarrollo dependiente de PR #411 · PILOTO únicamente.**

## Objetivo y límite de confianza
El proveedor puede cotizar por WhatsApp con un PDF, una foto o una planilla. Antes de generar la plantilla propia, debemos **guardar cada renglón extraído, en el orden recibido por la lectura documental**, junto al archivo original privado y su SHA256. Esto incluye artículos no pedidos, pallets, bolsones, impuestos, flete, descuentos, envases y otros cargos, sin ajustar ni reescribir importes.

**Importante:** el espejo es fiel al **borrador de la IA**, no acredita fidelidad al PDF o imagen. El documento binario privado sigue siendo la fuente de verdad. Ningún precio de este módulo está habilitado para ranking, divulgación al comprador ni adjudicación.

## Cambios
1. `supplier_quote_lines_mvp101` conserva `message_hmac + line_no` y las cadenas originales interpretadas de descripción, cantidad, unidad, precio unitario, importe de línea, cita de evidencia y ambigüedad. El original queda en `media_archive_mvp095`; el encabezado de `supplier_media_quotes_mvp098` conserva proveedor, ronda, SHA256, estado `awaiting_fidelity_check`, número de líneas y TOTAL literal. No se sobreescriben los valores por cálculo de la IA.
2. La RPC existente `cotironda_piloto_record_supplier_media_mvp098` mantiene las verificaciones anteriores: documento almacenado, chat y rol de proveedor coincidentes, consentimiento, invitación válida, ronda preparada no vencida. Valida todas las líneas antes de insertar el encabezado y guarda todas las filas en **una sola transacción**. Si hay una fila inválida o no se insertan exactamente N, no admite transcripción parcial.
3. Duplicados por HMAC: `duplicate`; un nuevo archivo con nuevo HMAC se considera otra fuente/version y no modifica el anterior. `line_mirror_complete=false` distingue recibos históricos creados antes de esta migración que aún no tienen espejo, sin inventar retroactividad.
4. Tabla privada con RLS sin políticas de lectura pública y sin permisos directos de `anon`, `authenticated` ni `service_role`. Un trigger rechaza UPDATE/DELETE. Solo el backend privilegiado llama a la RPC, que devuelve estados y recuentos **sin** precios, productos ni identidades.
5. No se crean `offer_versions`, publicaciones, enlaces, mensajes, ganadores ni cambios de precios. El total puede contradecir la suma de líneas: se conserva el total literal y se revisará aparte.

## Pruebas
- `tests/unit/mvp101-espejo-presupuesto-proveedor.test.mjs`: contratos de ingreso seguro, integridad, filas extras, total literal, privacidad y no promoción.
- `supabase/piloto/mvp101_smoke_rollback.sql`: cinco conceptos sintéticos (cemento, pallets, bolsones, flete, descuento), importe total expresamente contradictorio, orden, SHA256, duplicados, RLS, fuente conservada y no inserción de oferta verificada. Termina en `ROLLBACK`.
- La migración debe aplicarse **después de MVP-098, 099 y 100**, y ejecutarse el smoke SQL contra PostgreSQL 17 aislado o transacción reversible de PILOTO antes de cualquier instalación. Los resultados concretos de CI/DB deben comunicarse, no presumirse.

## Resultado de pruebas verificadas (02/11/2026)
- Ejecuté la migración y el smoke extendido **en una única transacción PostgreSQL 17 del proyecto Supabase `cotironda-piloto`**, con `lock_timeout=2s`, datos exclusivamente sintéticos, sin WhatsApp y `ROLLBACK` al terminar. Incluyó cinco conceptos, total contradictorio, fuente SHA256, duplicados, acceso, intento de UPDATE/DELETE, campo monetario de tipo incorrecto y 26 líneas: **aprobó sin excepciones**.
- Verificación posterior desde otra consulta: `to_regclass('cotironda_piloto_privado.supplier_quote_lines_mvp101') IS NULL` y `supplier_media_quotes_mvp098` tenía 0 recibos; **no se dejó instalada esta migración ni nuevos datos de ensayo**.
- GitHub Actions: pruebas unitarias, verificación del sitio y suite PostgreSQL 17 de aislamiento aprobadas en commit `55cf5763`. La validación de portal/PostgREST continuaba en curso al registrar este resultado.
- El linter de seguridad del piloto reportó 21 avisos informativos `rls_enabled_no_policy` de tablas privadas; no reportó advertencias críticas, pero ese análisis no reemplaza la revisión de permisos.
- No hubo mensajes de Whapi, envíos a compradores, despliegues ni cambio de secretos.

## Limitaciones y próximos controles
- El lector actual admite hasta **25 renglones** en borrador y archivos de hasta 3 MiB. Cuando se supera, queda pendiente: **nunca se trunca silenciosamente** ni se considera cotizado. Debemos eliminar esos topes técnicos gradualmente mediante partición/continuación validada y controles reales de costo.
- La lectura IA puede omitir conceptos, confundir `$ 7.000` unitario con total, ignorar IVA o leer mal signos. El siguiente MVP debe comparar todos los renglones contra evidencia original, resolver ambigüedades sin modificar fuente y bloquear comparaciones incompletas.
- La vista del comprador necesitará plantilla propia anónima con todas las líneas verificadas y TOTAL literalmente declarado; **no mostrar como presupuesto fiel este borrador**.
- Ranking: solo cotejar productos equivalentes a las mismas cantidades/unidades; indicar cobertura, IVA/flete, cargos y condiciones sin falsas posiciones, y hasta dos finalistas después del cierre conforme a reglas vigentes.
- Ninguna migración/despliegue se activa en producción por este cambio.
