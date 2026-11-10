# Acta 485 — MVP348: incidente de diagnóstico y revisión documental

**Fecha:** 10/11/2026. **Estado:** solo desarrollo, **NO DESPLEGADO**. **Issue:** #750. **Entorno inspeccionado:** Supabase cotironda-piloto (solo lectura). **Objetivo:** evitar nuevas solicitudes de secretos/cron que ya existen, registrar el motivo de rechazos documentales y mantener fidelidad de presupuestos.

## Hechos comprobados y error que no debemos repetir

1. El SQL MVP336/346/347 se publicó con migración 20261110180847 y el Edge cotironda-piloto-auto-recovery **v11 ACTIVE**. No se reemplazó el webhook Whapi ni el Edge del seguimiento.
2. El reporte de despliegue (acta 484, README, AGENTS y CHANGELOG) afirmó ERRÓNEAMENTE que faltaba un cron y un secreto. El usuario encontró en el panel el diálogo **«Confirm replacing existing secret»** para COTIRONDA_PILOT_AUTO_RECOVERY_SECRET. Se indicó **Cancelar** y no reemplazar la clave.
3. La auditoría descubrió el puente EXISTENTE: cron.job activo cotironda_piloto_document_recovery_5min, cada cinco minutos → Edge cotironda-piloto-document-recovery v34 → función privada invokeAutoRecoveryMvp293 → Edge cotironda-piloto-auto-recovery v11. La invocación usa la credencial de servicio **Y** el secreto privado. No se necesita crear otro cron, repetir claves ni pedir permiso para crear destinatarios.
4. Los registros function_logs mostraron cotironda_mvp293_internal_tick accepted a las 18:20, 18:25, 18:30 ... 18:55 UTC. **Accepted solo confirma HTTP 2xx: no implica que haya presupuesto verificado, asociado o visible.**
5. El ledger ai_supplier_auto_recovery_mvp292 muestra un PDF de 3 renglones tomado a las **18:20:03 UTC**, terminado a las **18:20:13 UTC** con state=review y reason_code=archived_materials_disagree. Es evidencia de intento de segunda lectura; **la segunda propuesta literal no se conservó en esta ruta**, por lo que NO sabemos qué campo cambió. Otro PDF de 2 líneas quedó review/multiple_indistinguishable_rounds, con correlación previa independent_reads_disagree. Los originales permanecen archivados y sin asignación inequívoca.
6. Seguían dos rondas activas, cero candidatas MVP346 y cero publicaciones MVP347. El circuito E2E NO está validado; no pedir reenvíos a Ailín/Nahuel ni afirmar 2 ofertas nuevas.

## Causa raíz

**Operativa:** se buscó una entrada cron con el nombre del endpoint final, en vez de inspeccionar la ruta cron → Edge padre → puente → Edge privado → ledger. Antes de afirmar que falta un cron/secreto, contrastar código desplegado, logs HTTP y estado SQL.

**Documental:** la función sameMaterials del worker MVP292 exigía igualdad textual exacta en descripción, cantidad y unidad. Eso mezcla diferencias inocuas de representación con cambios comerciales materiales y emitía siempre un código genérico.

**Idempotencia:** la lectura fallida dejó el origen como review en el ledger; el claim de recuperación no lo volverá a seleccionar automáticamente. Un cambio de código NO reintenta ese documento. Prohibido limpiar/reiniciar el ledger para forzarlo.

## Corrección MVP348 — solo código en desarrollo

- Nuevo comparador privado y determinista supplier-material-fidelity-mvp348.ts. Respeta mismo número y orden de líneas y sus descripciones, cantidades y unidades; no modifica ni sobreescribe original o segunda lectura.
- Acepta únicamente diferencias de formato inequívocas: mayúsculas, espacios/saltos de línea, normalización Unicode NFC y puntuación decimal de cantidades con 1–2 dígitos (1,50 y 1.5). No supone que 1.000 equivale a 1, ni que 1,000 equivale a 1000; tres cifras posteriores al separador quedan ambiguas si las lecturas no son idénticas.
- Rechaza cambios de material/marca/presentación, números, número u orden de ítems, unidad inexistente vs inventada, y equivalencias como bolsa vs bag vs bolsón. No hace cálculos de precios.
- El worker registra una categoría segura, sin texto privado: archived_second_draft_invalid, archived_draft_shape_invalid, archived_line_count_mismatch, archived_material_description_mismatch, archived_quantity_mismatch o archived_unit_mismatch, en lugar de archived_materials_disagree. Estos valores cumplen la restricción SQL de reason_code.
- El comparador solo habilita **correlación privada** si es confiable; publicación y cálculo económico siguen sujetos a los verificadores independientes MVP102/103/106 y MVP346/347 (SHA, fuente, IVA/flete/condiciones literales, aritmética, acceso, anonimato). **format_only no significa published_private**.
- Sin SQL nuevo, sin datos reales, sin consumir IA, sin WhatsApp, sin cambiar cron ni secretos ni despliegue bajo Luz verde.

## Runbook obligatorio para cualquier futuro incidente parecido

1. **Cron:** consultar todos los cron activos y su comando, incluyendo las funciones intermedias. Leer cron.job_run_details; el estado SQL «succeeded» no confirma respuesta final del worker.
2. **Puente:** leer el código efectivamente desplegado de cotironda-piloto-document-recovery y su auto-recovery-tick-mvp293.ts. Confirmar proyecto, flags, dos factores privados y endpoint exacto. No inferir del nombre del cron que falta el ejecutor final.
3. **Logs:** buscar cotironda_mvp293_internal_tick accepted/refused/off/unavailable/private_secret_unavailable. NO mostrar nunca tokens o secretos. Si hay accepted, NO crear otra clave ni cron.
4. **Ledger:** consultar ai_supplier_auto_recovery_mvp292 con state, reason_code, claimed_at y finished_at. Determinar si hubo intento, revisión, asociación privada o fallo; no confundir 200 HTTP con publicación.
5. **Publicación real:** contar supplier_revision_candidates_mvp346, anonymous_supplier_revisions_mvp347 y ofertas anónimas en tracking con token autorizado. 0 sigue siendo 0 aunque el puente acepte.
6. **Contenido:** si el PDF discrepa, registrar clase del desacuerdo. No completar ni reinterpretar unidades, cantidades, precios, IVA, flete ni asignación de ronda sin comprobación en el original. No enviar nuevos mensajes ni solicitar reenvíos por reflejo.
7. **Cambio y despliegue:** antes de publicar: comparar bundle actual con GitHub, correr Node/Deno/PG17/seguridad, auditar SHA y permisos, verificar reversión, versionar y confirmar autorización «Publicalo». Mantener actualizados README/AGENTS/CHANGELOG/actas; una fe de erratas explícita tiene prioridad sobre un diagnóstico histórico incorrecto.
8. **Reintento consumido:** requiere otra ruta versionada, auditada y de un solo uso. No se incluye en MVP348. No hacerlo a mano, no resetear estado y no desactivar guardrails. Sólo aplicar con nueva autorización de despliegue.

### Consultas de diagnóstico SOLO LECTURA (sin copiar secretos)

~~~sql
SELECT jobid,jobname,active,schedule,
 position('cotironda-piloto-auto-recovery' IN command)>0 AS auto_directo,
 position('cotironda-piloto-document-recovery' IN command)>0 AS puente
FROM cron.job ORDER BY jobid;

SELECT j.jobname,d.status,d.start_time,d.end_time
FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
WHERE j.jobname='cotironda_piloto_document_recovery_5min'
ORDER BY d.start_time DESC LIMIT 6;

SELECT state,reason_code,count(*) AS casos
FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
GROUP BY state,reason_code ORDER BY state,reason_code;

SELECT count(*) AS publicaciones_confirmadas
FROM cotironda_piloto_privado.anonymous_supplier_revisions_mvp347;
~~~

## Criterios de aceptación y límites

- Casos sintéticos: cambio de espacios/mayúsculas/decimal inequívoco acepta solo para correlación; cantidad, marca, unidad, orden y miles ambiguos deben permanecer review.
- El worker registra motivo no sensible en el ledger SQL, no llega a correlación si el material es distinto y nunca declara publicación sin RPC económica aprobada.
- El test de puente confirma que un cron padre puede invocar el trabajador con los dos secretos, sin construir segundo cron ni pedir al usuario una clave que ya existe.
- La CI Node/Deno/regresión debe estar verde antes de integración; no se afirma ninguna recuperación de PDF real por estas pruebas sintéticas.

**Pendiente crítico:** el PDF que quedó review el 10/11 no se reintentará solo con este cambio. Se necesita un reintento controlado, versionado e idempotente y comprobación de lectura original que no cambie datos; eso requiere otra revisión y «Publicalo». El otro PDF debe conservar su criterio de vinculación inequívoca.

**Reglas:** «Auditá» solo lectura; «Luz verde» desarrollo/tests/docs en rama sin publicar; «Publicalo» solo entorno/versión autorizados, no producción.
