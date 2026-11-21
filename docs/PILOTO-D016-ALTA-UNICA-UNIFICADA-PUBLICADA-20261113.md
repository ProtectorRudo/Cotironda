# Cotironda V2 — Acta de unificación de alta única de originales

**Fecha local:** 13/11/2026 · **Base real:** Supabase \`cotironda-piloto\` PostgreSQL 17 · **Entorno:** únicamente PILOTO, sin mensajes ni producción.

## Por qué hubo que corregir

Durante el avance se detectaron **dos alternativas independientes para la aceptación de originales una sola vez por proveedor**, ambas publicadas como infraestructura privada e inactiva:

1. **CANÓNICA, se conserva:** migración \`20261114022538\` \`cotironda_d016_one_time_supplier_original_terms_off_pilot_20261113\` de [PR #846](https://github.com/ProtectorRudo/Cotironda/pull/846). Objetos: \`v2_d016_supplier_terms_policy\` (OFF, SHA y aprobación sin configurar), \`v2_d016_supplier_terms_deliveries\`, \`record_terms_delivery_private\` y \`register_terms_acceptance_private\`. Mensaje explícito de aceptación \`ACEPTO COTIRONDA ORIGINALES V2\`, por canal y prueba verificable de Whapi.
2. **DUPLICADA, retirada:** migración \`20261114024509\` \`cotironda_d016_supplier_one_time_terms_inert_off_pilot_20261113\`, [PR #847](https://github.com/ProtectorRudo/Cotironda/pull/847). Había agregado una segunda política de términos, otra tabla de avisos y tres RPC con una frase de aceptación distinta. Eran todas vacías/inactivas; no se envió ningún mensaje, no se aprobó ningún término legal.

Mantener dos caminos podía provocar confusión en soporte, destinatarios y consentimiento documentado. Por eso se eligió el sistema que ya existía y se retiró la alternativa posterior **sin fusionar ni mezclar los flujos**.

## Publicación REAL de la corrección

**Migración Supabase \`20261114025045\`**, \`cotironda_d016_unify_supplier_signup_remove_duplicate_20261113\`, aplicada con \`success=true\`. Fuente exacta [SQL de limpieza de PR #848](https://github.com/ProtectorRudo/Cotironda/blob/fix/d016-unificar-alta-unica-quitar-duplicado-20261113/supabase/piloto/v2_d016_drop_duplicate_signup_only_CANDIDATE.sql).

Antes de modificar se verificó transaccionalmente: base \`postgres\` PG17; **7 rondas históricas, 1 preparada**; negocio/originales/cierre OFF; cero consentimientos de originales, avisos, eventos globales, filas de ambas alternativas; política canónica OFF y sin texto SHA aprobado; firmas y frases exactas de cada implementación. El SQL usó \`DROP FUNCTION\` para **tres RPC únicamente de #847**, y \`DROP TABLE ... RESTRICT\` para **sus dos tablas vacías**; no usó \`CASCADE\` ni tocó #846.

La prueba sintética [GitHub Actions D016, run 43548383967](https://github.com/ProtectorRudo/Cotironda/actions/runs/43548383967) aprobó con marca \`D016_SINGLE_SUPPLIER_SIGNUP_CLEANUP_PG17_PASS\`, PostgreSQL 17 y \`BEGIN/ROLLBACK\`, incluyendo verificación explícita de que el sistema canónico sobrevive intacto.

## Verificación POSTERIOR en Supabase REAL

| Control | Resultado |
|---|---|
| Rondas conservadas | 7, de las cuales 1 preparada |
| Tablas duplicadas de aprobación y aviso | **Eliminadas las dos** |
| RPC duplicadas de reserva/confirmación/aceptación | **Eliminadas las tres** |
| Política y ledger canónico #846 | **Conservados ambos** |
| RPC de entrega y aceptación canónicas #846 | **Conservadas ambas** |
| Entregas canónicas | 0 |
| Condiciones canónicas habilitadas | **OFF** |
| Consentimientos de originales | **0** |
| Negocio/originales/cierre | **OFF / OFF / OFF** |
| Whapi v76, portal Vercel, producción | **Sin modificaciones** |

## Decisiones para el piloto

- Un **solo circuito de incorporación** de proveedor, con una aceptación informada y verificable una sola vez; ninguna confirmación por presupuesto.
- **NO activar** la política de originales ni enviar términos hasta revisión jurídica del texto exacto conforme a Ley 25.326 y validación de recepción Webhook/Whapi.
- Antes de integrar en Whapi, reforzar el caso especial de **reaceptación después de «NO COMPARTIR»**: una aceptación posterior a la baja debe referirse a un **aviso NUEVO y posterior**; no se debe permitir reutilizar un aviso antiguo. Auditar reenvíos y el control por mensaje y chat en la ruta canónica #846.
- Configuración server-only de HMAC y credencial privada Supabase en Vercel Preview; UI f985 sujeta a reintento de cuota **ya programado**; sin acceso a los originales hasta prueba E2E con comprador y dos proveedores. Se mantiene SSO de Preview hasta verificar.
- El PR #847 se declara **superado y no debe fusionarse**. [PR #848](https://github.com/ProtectorRudo/Cotironda/pull/848) registra la limpieza. El canon comercial V2 y su continuidad permanecen en [#794](https://github.com/ProtectorRudo/Cotironda/issues/794), seguridad de originales en [#838](https://github.com/ProtectorRudo/Cotironda/issues/838).

**No declarar el piloto 100% listo:** las pruebas de SQL son reales, pero no se probó todavía el WhatsApp/portal con archivos de proveedores y aprobación jurídica.
