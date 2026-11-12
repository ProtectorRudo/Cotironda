# Cotironda V2 — V2-00 Inventario de reutilización y bloqueos (12/11/2026)

**Estado:** auditoría parcial de código y PILOTO en **SOLO LECTURA**. Sin cambio de esquema, datos, mensajes ni despliegues. **Este documento NO declara V2-00 aprobado**: falta conciliar el linaje del código, permisos de Storage y el despliegue Vercel/Whapi contra fuentes efectivas.

## Fuentes y advertencia sobre ramas

- Contrato funcional V2: [D012](COTIRONDA-V2-CONTRATO.md), [D013](V2-D013-CATALOGOS-EQUIVALENCIAS.md), [plan](PILOTO-100-PLAN-MAESTRO.md), [estado](PILOTO-100-ESTADO.md), Issue #794.
- **`main` al momento de esta consulta** contiene sitio estático, docs y un único test de sitio; **NO contiene `apps/`, `src/`, `supabase/` ni `tests/` del núcleo**. Probar `main` no equivale a probar el piloto operativo.
- Código inspeccionado en **`feat/p1-diagnostico-documental-20261112` (PR #813, todavía DRAFT)**. Las correcciones de PR #814 se consideran **CONGELADAS**, porque prohíben rondas simultáneas al proveedor.
- La dirección V2 está en **`docs/cotironda-v2-unica-direccion-20261112` (PR #815 DRAFT)**, derivada de la cadena documental #795 → #796. **No unir ramas a ciegas:** planificar una reconciliación de base de código con tests y sin arrastrar la restricción comercial #814.
- Supabase **PILOTO real**, proyecto `ilggkalaafhtiysyzlmg`, consultado **solo lectura** el 12/11/2026. Los resultados son un snapshot, no garantía de estado futuro. No se consultaron secretos ni contenido de presupuestos.

## Inventario por componente

| Componente | Evidencia de código/servicio | Reutilizar / adaptar / congelar | Validación pendiente |
| --- | --- | --- | --- |
| Ingreso y envío WhatsApp | Edge `cotironda-piloto-whapi` **ACTIVA v76** en PILOTO; `supabase/functions/cotironda-piloto-whapi`, `src/server/whapi-*` en PR #813; 2 invitaciones preparadas en la única ronda preparada | **REUTILIZAR** entrada autenticada, outbox, idempotencia y transporte; **ADAPTAR** formato de solicitud por producto y referencia inequívoca | Comprobar versión desplegada contra SHA de fuente y prueba sin envíos |
| Catálogos | Tabla `cotironda_piloto_privado.catalogue_lines` con `literal_description`, `family_code`, `recognition_state`; `participants` guarda localidad y confirmación. **106 líneas**, **86 `curated_family`**, **2 proveedores**, **0 catálogos formalmente confirmados** | **ADAPTAR CON PRIORIDAD D013**: inventario por producto/variante, equivalencias, unidades y requisitos técnicos; conservar los literales existentes, sin atribuir stock | Confirmar procedencia de cada catálogo y estrategia de activación; nunca autorizar envíos por rubro |
| Selección de destinatarios | `src/domain/invitaciones-por-producto.ts`, `identidad-producto.ts`, `ia-central/ruteador-catalogos-v2.ts` son motores offline con producto canónico/SKU, pero conservan comparaciones por `rubro`. `supabase/piloto/mvp148_per_request_catalogue_dispatch.sql` habilita con `family_code` y `curated_family`. RPC viva `cotironda_piloto_ia_publish_mvp222` referencia catálogo y rubros; no prueba routing D013 | **ADAPTAR**: no filtrar por rubro, exigir coincidencia a producto concreto y compatibilidad técnica; confirmar marcas excluyentes/presentaciones | Pruebas Ceresita↔hidrófugo compatible, cemento 50↔25 kg mismo tipo, marca obligatoria, producto inexistente, multirrubro, zona, cero duplicados |
| Recepción, originales y SHA | `whapi_inbox` vincula mensaje y ronda; `media_archive_mvp095` conserva `content_sha256`, MIME, tamaño, ruta privada y estado; PR #797/#798/#802 plantean recepción y originales sin gate económico | **REUTILIZAR custodia/procedencia**, **ADAPTAR publicación de original** al comprador identificado sin esperar parser; congelar anonimato | Validar ACL/RLS, integridad SHA descargado, Storage privado, fuentes duplicadas, exportación de originales, tokens revocables |
| Correlación de respuesta ↔ ronda | `ai_dispatch_jobs_mvp222` conserva `whapi_message_id`; `ai_supplier_links_mvp225`, `ai_supplier_unresolved_mvp237`, `ai_supplier_auto_correlation_mvp291`, `ai_supplier_preambles_mvp238`. Snapshot: **3 entradas `ambiguous_round` en historial**, **1 mensaje vinculado**, **3 intentos de autocorrelación** | **PRIORIDAD V2-02:** reutilizar prueba de mensaje citado + identidad + fuente; **ADAPTAR** a múltiples rondas; no emparejar por hora ni relink histórico forzado | Probar 2 rondas del mismo proveedor, cita válida/ajena/ausente, PDF precedido de texto, duplicado, hash distinto y evidencia insuficiente → revisión interna |
| Portal y autenticación | `apps/portal/`, `apps/seguimiento-piloto/`, `piloto/seguimiento-web/` en rama operativa; `src/domain/ia-central/recepcion-documental-mvp354.ts` expone recuentos de invitados, pendientes y anonimato heredados. **`auth.users=0`** en PILOTO | **ADAPTAR** portal a SOLO respondedores (identidad+original+análisis); **REUTILIZAR** Auth privada, descarga autorizada y trazabilidad; **CONGELAR** recuentos de pendientes y etiquetas anónimas | Un comprador autenticado, 0/1/2 cotizantes, acceso móvil, permisos por empresa, URLs firmadas, aislamiento |
| IA individual y comparación | `src/domain/ia-central/calificador-cotizaciones-mvp225.ts`, `src/domain/equivalencia-catalogo-mvp171.ts`, `src/domain/cotejo-presentaciones-mvp174.ts`; buena parte compara/importa para ranking histórico | **REUTILIZAR** evidencia, diferencias técnicas y conversiones deterministas; **ADAPTAR** a comentario individual orientativo y análisis general por producto; **CONGELAR** ganadores/ranking | No inventar IVA/flete/stock/total; original intacto; no comparar totales de canastas diferentes |
| Plazos/cierre | `requests.round_days`, `requests.closes_at` existen; hay cron/cierre heredado y Edge `cotironda-piloto-finalistas` activa | **ADAPTAR** a 2 días hábiles (sin ganadores automáticos); **CONGELAR** `finalistas` del circuito V2 | Calendario de feriados Argentina, zona horaria, fechas límite y cierre idempotente |
| Operación/deployment | **main** estático; rama operativa extensa y PR apilados; al menos WHAPI v76, seguimiento v29, recuperación v34 están activos según listado de Edge; **no se verificó Vercel ni el código SHA remoto de cada función** | **RECONCILIAR** base de código y builds antes de implementar; evitar desplegar PR #814 | Construir matriz `ruta → commit código → estado PR → deployed SHA → test` |

### Comprobaciones de esquema concreto

- En PILOTO, `catalogue_lines` contiene `participant_key,line_no,literal_description,family_code,recognition_state,created_at`. **NO contiene campos propios para `producto_id`, SKU, marca, presentación, unidad base o atributos técnicos**. Los motores offline que contemplan estas propiedades **no demuestran que la selección real las utilice**.
- `requests` contiene `id,buyer_key,delivery_city,state,round_days,closes_at`; `invitations` relaciona `request_id` y `supplier_key`. `ai_dispatch_jobs_mvp222` conserva mensaje Whapi de salida; `ai_supplier_links_mvp225` evidencia hash y origen de asociación. Se puede extender de forma trazable, sin crear otro sistema.
- Existen **1 ronda `prepared`** y **2 invitaciones de esa ronda**. Esto **no demuestra** dos presupuestos asociados ni V2 funcionando. **0 usuarios Auth**.
- El motor offline `ruteador-catalogos-v2.ts` valida `source.rubro===requested.rubro` además de que la línea exista en el catálogo. D013 **prohíbe ese filtro excluyente**. El motor `invitaciones-por-producto.ts` también exige rubro en `evaluarSku`; el producto canónico y seguridad técnica deben reemplazarlo, no una simple eliminación ciega.

## Triage de PR abiertos (no integrar por inercia)

| PR / grupo | Decisión V2 | Motivo |
| --- | --- | --- |
| #797, #798, #802 | **REUTILIZAR / ADAPTAR** | Custodia documental con procedencia y originales no bloqueados por parser |
| #803 | **ADAPTAR** | Alta/autenticación del comprador: PILOTO todavía tiene 0 usuarios Auth |
| #804–#812 | **SELECCIONAR MINIMO / CONGELAR EXCESO** | Preservar aviso comercial prospectivo y permisos; evitar MFA/confirmación por cada presupuesto |
| #813 | **BASE DE AUDITORÍA, NO AUTOMERGE** | Diagnóstico de origen y ambigüedad; no resuelve por sí solo doble ronda |
| #814 | **CONGELAR — NO DESPLEGAR** | Bloquea a un proveedor en múltiples rondas simultáneas, contrario a V2 |
| #815 | **DIRECCIÓN DOCUMENTAL VIGENTE DRAFT** | Contrato D012/D013, estado, plan y continuidad; no es código operativo |
| #761–#793, PR históricos de economía/finalistas | **FUERA DEL CAMINO CRÍTICO** | Extraer exclusivamente piezas de fuente, seguridad y conversiones verificadas |

## Próxima secuencia sin reconstrucción

1. **Completar V2-00**: contrastar Vercel, versión real de Edge con código y Storage/RLS; elegir de qué rama funcional parte el PR V2-02. **No usar `main` estático como si contuviera todo el núcleo ni construir sobre #814.**
2. **Primer cambio de código V2-02**, aislado y con pruebas PG17/Node: vínculo automático por `supplier_key + message_hmac + quoted_whapi_id` que corresponda al despacho probado; formato de referencia corta única por solicitud en el propio mensaje de pedido, sin tarea adicional para el negocio. Si el archivo llega sin cita y hay varias rondas, no asignarlo por fecha ni solo por similitud IA: mantenerlo privado para revisión. Respetar hashes, deduplicación y permisos.
3. **V2-01 catálogo D013** en el paso inmediato siguiente: normalización semántica ↔ producto canónico de cada catálogo, compatibilidad técnica y cantidades verificadas, sin rubro como criterio de elegibilidad.
4. **V2-03–06**: mostrar originales identificados solo a comprador autenticado, análisis no bloqueante, cierre 2 hábiles y E2E real de 1 comprador + 2 proveedores.

**Criterio de aceptación del primer PR V2-02:** dos pedidos simultáneos al mismo comercio; el proveedor cita uno y se vincula solamente a ese pedido, un mensaje duplicado no crea otro documento, un archivo sin cita y sin fuente inequívoca queda `ambiguous_round`, una cita ajena/revocada no se acepta, ninguna cotización puede verse desde otra empresa. SIN mensajes reales ni DDL sobre PILOTO sin autorización explícita de publicación.

## Estado de este avance

**DOCUMENTADO + AUDITORÍA EN SOLO LECTURA**. No se ejecutaron los tests del código ni se modificó la base. V2-00 **EN CURSO**, V2-01–06 **PENDIENTES**. El inventario demuestra bloques reutilizables y bloqueos verificables; NO demuestra E2E ni disponibilidad comercial.
