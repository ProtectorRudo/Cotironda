# Acta 510 — Publicación controlada B5n en cotironda-piloto

**Fecha:** 11/11/2026. **Orden:** «Publicalo», limitada al proyecto Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`). **Código fuente exacto:** commit `a73571690d415af4bd6c82a0a961a7ded59bd2e1` del [PR #781](https://github.com/ProtectorRudo/Cotironda/pull/781), todavía en borrador y sin merge. No se publicaron cambios en producción, Vercel, Whapi ni interfaz del arquitecto.

## Controles previos confirmados
- **6/6 workflows GitHub pull_request SUCCESS**, incluidos Next.js y PostgreSQL 17; **4/4 trabajos específicos B5n SUCCESS** (Node, PDF.js Deno, PG17 con ROLLBACK, regresión completa).
- Estado previo: Edge `cotironda-piloto-v2-shadow` **v9 ACTIVE**, 23 archivos, 5 flags V2 OFF, 0 leases, 1 diagnóstico B5k, 1 B5m, 0 B5n.
- B5m histórico aceptable para relectura privada: cinco condiciones, tres atribuidas, subtotal de materiales coincidente, cobertura `line_assignment_ambiguous`, flete con importe desconocido.
- `whapi_outbox=6` (**5 api_accepted, 1 cancelled**), `anonymous_offers_mvp091=0`, `offer_versions=1`, `finalist_whapi_outbox_mvp110=0`.
- RLS activa y sin SELECT ni claim RPC para `anon`; puente cron de documentos activo, Vault de credencial configurado sin lectura del secreto.

## Cambios instalados y comprobados
1. Migración aplicada correctamente y registrada en historia como `cotironda_v2_b5n_pdf_condition_replay_privado_20261111` (20261111173047), con el archivo `supabase/piloto/v2_b5n_private_pdf_replay_versioned.sql` del commit exacto.
2. El constraint del ledger privado permite `v2_b5k_20261111`, `v2_b5m_20261111`, `v2_b5n_20261111` sin cambiar sus filas anteriores.
3. La función de relectura sigue deshabilitada por defecto; cinco flags OFF y `claim` devuelve `disabled`; RLS continúa activa y `anon` sin permisos.
4. Desplegada Edge `cotironda-piloto-v2-shadow` **v10 ACTIVE**, SHA de paquete `a4bc4dd0f42fabba725650063c4b006339ba5482f816ac630ba4120b351e533e`. Contiene 23 archivos, solo dos módulos reemplazados respecto de v9: `src/domain/presupuestos-v2/auditoria-cobertura-original-b5l.ts` y `src/domain/presupuestos-v2/worker-moneda-original-b5k.ts`. El resto se conservó.

## Bloqueo de la prueba real (NO declarar superado)
Se intentó iniciar **una sola** relectura desde el puente documental existente con la credencial conservada exclusivamente en Vault; **los controles de seguridad de la herramienta rechazaron esa operación** antes de devolver identificador de solicitud (`request_id=null`). No se debe atribuir esta falla a B5n ni al PDF.

Un cierre de protección apagó explícitamente los cinco flags. La verificación posterior de solo lectura confirmó:
- Edge v10 ACTIVE y migración B5n registrada.
- `B5k=1`, `B5m=1`, `B5n=0`; **no hubo diagnóstico B5n nuevo**, por lo que no se conoce aún el motivo concreto de la condición ordinal 4.
- `leases=0`, cinco flags OFF, `whapi_outbox=6`, `anonymous_offers=0`, `offer_versions=1`, `finalist_whapi_outbox=0`.
- **Ninguna oferta pública, ranking, contacto o mensaje nuevo.**

### Pendiente operativo
La publicación de código está completa, pero la **relectura real no**. Para efectuarla deberá utilizarse una vía aprobada del proveedor que ejecute la función interna sin divulgar ni transportar secretos a través de herramientas que la bloquean. No extraer el token de Vault, no crear credenciales alternativas, no dejar el flag activado esperando un cron, ni reemplazar el bloqueo con una simulación. Cuando esa vía esté disponible, ejecutar una sola relectura versionada, apagar flags y comparar motivo ordinal/cobertura de B5n con B5m, respetando IVA, flete y moneda ISO sin inferencias.

El resultado de esta publicación **no acredita un piloto comercial E2E**. No integrados PR #778 ni #781.
