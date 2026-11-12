# Acta 541 — P1/P2: la ambigüedad quedó registrada, no se perdió el webhook

**Fecha:** 12/11/2026. **Permiso:** «Avanza y registra en nuestro checklist y plan maestro». Desarrollo y auditoría **solo lectura** del proyecto PILOTO `ilggkalaafhtiysyzlmg`. Sin nuevas invitaciones, mensajes, modificaciones en producción/piloto ni reintentos del documento original.

## Resultado comprobado: causa del 0/2

El archivo de un proveedor, recibido **10/11/2026 a las 11:19 UTC**, está en `media_archive_mvp095` como `stored` y existe en `whapi_inbox` como `needs_review`. El archivo y el inbox conservan **`request_id=NULL`** y no hay vínculo MVP225 formal.

El registro histórico de *Edge gateway* muestra, alrededor de las **11:19 UTC del 10/11**, una llamada HTTP **200** a **`cotironda_piloto_ia_link_supplier_mvp225`**, además de `receive_whapi_v1`, `reserve_media_mvp095`, `finish_media_mvp095` y `ia_attach_supplier_media_mvp238`. La función Whapi que procesó el archivo era **v75**, no la v76 activa ahora. HTTP 200 solo acredita que respondió el endpoint RPC, **NO** que devolvió `linked_for_semantic_review`.

Los ledgers privados **sí** conservan el motivo:
- `ai_supplier_unresolved_mvp237.state = ambiguous_round`, método `single_active_round`, **candidate_count = 2** en el momento de asociar.
- `ai_supplier_auto_correlation_mvp291.state = review` y `reason = insufficient_material_evidence` (sin evidencia material suficiente).
- `ai_supplier_correlation_retries_mvp336` contiene **un reintento** con la misma razón. **No ejecutar de nuevo por comodidad ni borrar registros.**
- Actualmente puede quedar una sola ronda `prepared`, pero esa situación posterior **no cambia retroactivamente la ambigüedad histórica**. La coincidencia de fecha/empresa no prueba de qué pedido era la respuesta.
- El segundo proveedor continúa sin documento candidato en la ventana. **0 de 2 documentos asociados y acreditados.**

## Error del preflight anterior y corrección

La primera versión del preflight MVP354/355 creado en PR #813 consultaba `blocked` **solo a partir de `with_proof`**. Un documento *ambiguo, que justamente no tiene proof*, nunca entraba al conjunto: el informe mostraba **cero conflictos**. Era un **falso negativo de observabilidad**, no prueba de que no hubiera conflicto.

Actualización en el mismo **[PR #813](https://github.com/ProtectorRudo/Cotironda/pull/813)**:
- `blocked` ahora parte de **`candidates`** y verifica `ai_supplier_unresolved_mvp237` sin exigir asociación. `verified` mantiene inalterado el requisito de **`with_proof` + doble request_id + SHA**.
- El SQL devuelve contadores agregados sin nombres/HMAC/precios/contactos: `proveedores_ambiguous_round_mvp237`, `max_rondas_candidatas_en_fallo`, `proveedores_m291_sin_evidencia`, `proveedores_con_reintento_registrado`.
- Un test Node asegura que **los bloqueos se detectan antes de la prueba**, mientras que ningún presupuesto puede considerarse recibido sin ella. El script sigue siendo **un SELECT**, nunca un RPC público ni una reparación automática.

**Reconsulta REAL de SQL SOLO LECTURA en PILOTO (12/11/2026):**

| Indicador | Resultado |
|---|---:|
| Rondas `prepared` vigentes | 1 |
| Proveedores invitados y despachos aceptados | 2 y 2 |
| Proveedor con archivo guardado candidato | 1 |
| Proveedores con prueba fuerte de recepción | **0** |
| Proveedores en revisión por conflicto `ambiguous_round` | **1** |
| Máximo de rondas candidatas registradas al fallar | **2** |
| Proveedores con lectura M291 sin evidencia material | **1** |
| Proveedores con reintento registrado | **1** |
| Proveedor sin archivo candidato | **1** |
| Presupuestos verificados | **0/2** |
| MVP354 instalado | **No** |

## Diagnóstico definitivo y próxima acción

**El webhook NO omitió llamar a MVP225.** La decisión de no vincular fue conservadora: había dos rondas candidatas y la segunda evaluación no reunió evidencia que desempatara. La deuda real para esta ronda es **la evidencia de procedencia**, no la lectura del PDF.

- [x] Revisión cruzada de logs históricos, código desplegado y ledgers (sin exponer el contenido del proveedor).
- [x] Diagnóstico read-only corregido y ejecutado contra la base real.
- [ ] Certificar CI último SHA en PR #813 antes de cerrar su validación.
- [ ] Para el primer archivo, examinar únicamente evidencias verificadas de mensaje citado Whapi, preámbulo autenticado o una nueva respuesta inequívoca del proveedor; **si no existen, mantener `en revisión`**. No fabricar `request_id`, revivir/reintentar lectura automática agotada ni forzar "ronda única" desde el presente.
- [ ] Acreditar el original del **segundo proveedor** por una respuesta nueva genuina. No enviar WhatsApp sin autorización de publicación.
- [ ] MVP354/MVP355 aún requieren activación controlada y prueba del tracking privado del arquitecto; P0/P3–P5 conservan sus bloqueos Auth/consentimiento/descarga. Ningún E2E declarado.
- [ ] Con orden `Publicalo en cotironda-piloto`, preparar una **única** prueba real, sin crear otra ronda preparada superpuesta.

**Próxima acción única:** verificar fuente de mensaje citado/preámbulo del candidato con evidencia técnica real y, si no existe, no atribuir. Gestionar nueva respuesta auténtica únicamente dentro de un circuito autorizado; luego probar el segundo proveedor y la vista del comprador. No sumar desarrollo de precio/IA mientras P1/P2 estén abiertos.

Fuentes de continuidad: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [Acta 540](540-p1-diagnostico-dos-originales-solo-lectura.md), [PR #813](https://github.com/ProtectorRudo/Cotironda/pull/813).
