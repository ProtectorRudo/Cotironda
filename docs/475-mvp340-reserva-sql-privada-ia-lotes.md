# Decisión 475 — MVP340: reserva durable y finalización privada de lotes IA

**Fecha:** 10/11/2026 — **ESTADO: solo desarrollo / SQL sintético PG17 con ROLLBACK**, sin publicación.  
**Dependencias:** PR #742 MVP336 → PR #743 MVP337 → PR #745 MVP338 → PR #746 MVP339.  
**Problema:** MVP339 tenía `reserve` y `finish` inyectables, pero ningún RPC real que controlara identidad, archivos, cuotas y duplicados. Sin esa barrera, dos workers podrían cobrar dos veces por el mismo presupuesto.

## Auditoría previa (solo lectura de SQL real del piloto y repositorio)

- `requests.id` es UUID; `participants.key` es texto (ej. `corralon_ailin`). El proveedor no tiene UUID.
- `whapi_inbox` almacena `message_hmac`, `chat_hmac`, `participant_key`, `request_id`; el original binario está vinculado en `media_archive_mvp095` con SHA256, MIME, ruta privada y estado.
- `ai_supplier_links_mvp225` identifica el mensaje con **una sola ronda**, comprador y proveedor, y admite asociaciones directas. `semantic_unique_mvp291` requiere, además, una decisión final `linked` registrada en el correlador.
- `invitations` acredita invitación; `ai_dispatch_jobs_mvp222` / `whapi_outbox` acreditan solicitud aceptada ANTES de la respuesta del proveedor.
- El piloto usa PostgreSQL 17. El código fuente y las pruebas se desarrollan en GitHub sin ejecutar migraciones allí.
- Supabase exige restringir `SECURITY DEFINER`: `search_path=''`, esquema calificado, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`, y concesión exclusiva `service_role` para RPC internos.

## Implementado en rama

### Migración nueva, **no aplicada al piloto**

`supabase/piloto/mvp340_reserva_ia_lotes_fuente_autenticada.sql`

Crea `cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340` con:

- **PK `source_hmac`** + FK al original. Una fuente no puede volver a reservarse, incluso tras fallas de API, caídas del worker o finalización; incertidumbre = revisión interna, nunca reenvío automático.
- Identidad de ronda, `supplier_key`, `chat_hmac`, SHA del archivo y SHA del **plan completo de lotes**. El digest del plan protege posiciones, lotes, secciones y texto, pero **SQL no vuelve a abrir el archivo**: el trabajador autenticado deberá comprobar bytes, digest y plan antes de reservar.
- `receipt` UUID secreto de un solo uso, estado `leased/analysis_ready_private/review_required`, filas previstas, lotes previstos, presupuesto de llamadas/caracteres y resultados de lectura **sin guardar materiales ni precios**.
- `RLS ENABLED`, cero permisos de tabla directos incluso para `service_role`; funciones privadas `SECURITY DEFINER` de búsqueda completamente calificada y ejecución limitada a `service_role`.
- `cotironda_piloto_reserve_supplier_lots_mvp340(...)`: valida identidad completa, archivo realmente almacenado, vínculo a la misma ronda, invitación enviada, participantes habilitados, plazo vigente, MIME permitido, control de 20 filas por lote y **cuota diaria de 160 llamadas de modelo por proveedor**. Bloquea la fila del proveedor `FOR UPDATE` para serializar cuotas. No manda ni responde WhatsApp.
- `cotironda_piloto_finish_supplier_lots_mvp340(...)`: solo finaliza una reserva `leased` del mismo mensaje, ronda, proveedor, chat, SHA, plan y receipt. Un resultado `analysis_ready_private` exige dos lecturas completas; no crea versión de oferta, ranking ni contacto. Errores externos no permiten finalizar como éxito.

No se agregan rutas HTTP ni se modifican los RPC/productores existentes; los nuevos RPC solo podrán ser consumidos por un futuro worker con `service_role` protegido.

### Puente tipado hacia MVP339

`src/domain/ia-central/puente-reserva-sql-mvp340.ts` calcula SHA-256 determinista de cada plan y adapta los parámetros/respuestas RPC a `procesarLotesIAInternosMvp339`. No contiene un cliente Supabase ni secretos; recibe un callback `rpc` ya protegido. Impide cambiar ronda/proveedor tras crear el plan y niega resultados dudosos.

## Verificación/criterios de aceptación

- SQL PG17 sintético con archivos archivados, proveedor vinculado e invitación acreditada, montado sobre los fixtures históricos y un solo `BEGIN/ROLLBACK` final.
- Una reserva legítima retorna recibo de 32 caracteres hex, sin datos comerciales; mismo origen no puede facturar IA dos veces.
- Chat, SHA, proveedor, ronda o receipt ajeno no reserva/finaliza; presupuesto insuficiente y lotes vacíos tampoco.
- Una lectura parcial o un `finish` duplicado no obtiene `analysis_ready_private`.
- Anon, authenticated y cliente no pueden acceder a tabla ni ejecutar RPC; service_role sí puede llamar funciones pero **no SELECT directo a tabla**.
- Cero modificaciones de `whapi_outbox`, despacho, ofertas anónimas ni contactos en el test.
- Prueba Node del adaptador SQL con RPC mock + orquestador real, sin OpenAI, y Deno typecheck del TS compartido.
- Auditoría de todos los cambios en rama y validación GitHub. No modificar datos reales ni levantar cron con «Luz verde».

## Qué sigue bloqueando el piloto y por qué no se puede publicar aún

1. Integrar el worker privado con Vault/service_role y el depósito cifrado: comprobar que **el binario realmente guardado** corresponde a SHA + plan, sin imprimir contenido y sin repetir llamadas de OpenAI.
2. El RPC guarda presupuesto máximo de invocaciones y caracteres, **no conoce tokens reales ni el precio del modelo**: falta presupuesto de pesos y límite de gasto por empresa, además de conciliación por respuesta.
3. Persistir lecturas por lote cuando corresponda, bajo RLS, permisos y retención; actualmente solo se guarda el resultado agregado, sin propuestas. No mostrar precios desde este ledger.
4. Probar el lector visual independiente y coherencia económica de los presupuestos; luego 150+ originales reales anonimizados y circuito E2E WhatsApp→oferta anónima→cierre.
5. Revisar migraciones acumuladas, backups y costos del piloto. `Publicalo` es autorización separada y **solo** del entorno definido.

**Decisión:** preparar la barrera durable sin modificar el piloto ni prometer que los presupuestos de Ailín/Nahuel ya se analizaron; la fuente de verdad sigue siendo GitHub y la verificación PG17 de CI.
