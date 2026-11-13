# Cotironda V2-24 — liberación automática con calendario y consentimiento verificados

**Fecha:** 13/11/2026 · **Estado:** desarrollo y pruebas, NO publicado · PR #836.

## Problema real y decisión

El webhook PILOTO v76 y su candidato V2 utilizan `publicar:false` al interpretar un pedido (V2-23 ya corrige el ruteo por producto y la continuación de localidad). **No cambiar ese booleano a `true`**: su publicador histórico no verifica la modalidad de 2 días hábiles. Ya existe un mecanismo de liberación automática MVP306 que recibe el pedido una vez preparado, verifica el original del comprador, catálogos y los proveedores, y recién entonces autoriza el publicador MVP222, sin pedir `CONFIRMAR COTI`.

**Hallazgo read-only en PILOTO real:** `cotironda_piloto_ia_auto_release_mvp306(text,text)` y `cotironda_piloto_ia_publish_mvp222(uuid)` **están instaladas**; sus antiguos gates `ai_auto_release_gate_mvp306.enabled` y `ai_dispatch_gate_mvp222.enabled` están **ON**. El hecho de que estén ON **NO autoriza** rondas V2 de 2 días hábiles: no validan la modalidad V2. No se alteraron ni se desactivaron las funciones históricas.

## Solución V2-24 (exclusiva de rondas nuevas V2)

1. SQL candidato `supabase/piloto/v2_24_auto_release_calendar_guarded_candidate.sql`: agrega una **política separada V2**, privada, `cotironda_piloto_privado.v2_auto_release_policy` con **enabled=false** al instalarse. Crea `public.cotironda_piloto_v2_auto_release_d013(text,text)`, `SECURITY DEFINER SET search_path TO ''`, invocable exclusivamente por `service_role`. No altera M221, MVP222, MVP306, V2-21/V2-22, ni ninguna ronda histórica.
2. La nueva RPC es una transacción única bajo bloqueo de la ronda `FOR UPDATE OF r`. **Antes** de invocar cualquier publicador exige: identidad HMAC de comprador firmada y consentida; evidencia `ai_shadow_requests_mvp221.status=shadow`; ronda `draft`, todavía vigente, creada **después** de activación V2; `timing_mode='business_two_days'` y `round_days=2`; existencia y activación de la política V2 de calendario; `v2_deadline(created_at,delivery_city)` verificable y exactamente igual al `closes_at` almacenado; `v2_calendar_revision` igual a calendario anual aprobado por localidad/año de vencimiento.
3. **Después** de pasar esos controles llama a la autorización histórica MVP306 (verificación original, archivo fuente, identidad, snapshot SHA, renglones, proveedor contactable y permisos). Solo ante respuesta autorizada para **esa misma ronda** invoca MVP222 (revalidación de proveedor, productos declarados, zona, consentimiento, cola idempotente). **No llama WhatsApp**; deja los trabajos para el despachador con lease y HMAC que ya existe.
**Garantía de atomicidad adicional (auditoría del 13/11):** si la liberación MVP306 interna autoriza una ronda **distinta** de la bloqueada, o si el publicador MVP222 devuelve un estado no publicable después de la aprobación, la RPC V2 lanza excepción y PostgreSQL revierte **toda la transacción** (incluida la fila de aprobación MVP306). La Edge informa `conciliacion_requerida` y **no reintenta Whapi**. Una prueba PG17 con funciones internas sintéticas que escriben antes de fallar verificó la reversión y ausencia de aprobaciones parciales.

4. En la Edge **candidata offline** `scripts/piloto/v2-live76-candidate.mjs`, se sustituye únicamente el import/call de liberación histórica por `supabase/functions/cotironda-piloto-whapi/ai-central-buyer-auto-release-v2-d013.ts`. El nuevo helper llama a **una sola RPC privada V2**, sin fallback MVP306 si falta o falla. Un nuevo interruptor de Edge `COTIRONDA_PILOT_V2_AUTO_RELEASE_ENABLED` debe estar **literalmente `true`**, además de las barreras SQL existentes; ausente o `false` ⇒ NO intenta liberar. El pedido sigue preparándose con `publicar:false` y NO necesita una confirmación adicional del arquitecto.
5. El webhook vivo v76 **no se modifica**, sigue usando MVP306 como antes. El candidato conserva autenticación Whapi, prevención de duplicados, cuota, control de proveedor y rastreo. MVP306 y MVP222 históricos **no se modifican**.
6. El código V2-24 sólo afecta la **liberación**; no instala todavía la RPC de ruteo V2-21, el calendario V2-05/V2-22, no habilita mensajes ni expone originales o datos del comprador.

## Pruebas / aceptación

- `tests/unit/v2-24-auto-release-calendar-protegido.test.mjs`: apagado → 0 RPC, origen no autorizado → 0 RPC, positivo → exactamente **una RPC V2**, opciones SQL no elegibles, estado incierto / ID inválido → conciliación sin reintento, generador Edge v76 intacto salvo imports del overlay, sin preguntar `CONFIRMAR COTI`.
- `supabase/tests/ci/v2-24-auto-release-guard-pg17.sql`: **PostgreSQL 17 transaccional sintético**. Stubs declarados y reconocidos (NO fuentes oficiales). Prueba política OFF, calendario OFF, ronda legada, vencimiento erróneo, revisión anual diferente, revocación comprador, ronda pre-activación, desautorización roles públicos, una aprobación y publicación positiva, y que una segunda ejecución no duplica envíos; **ROLLBACK** al final.
- `.github/workflows/cotironda-v2-d013-plazo-habil-pg17.yml` incorpora unitarias y PG17 V2-24; V2-05 continúa comprobando el cálculo real del segundo día hábil y feriados sintéticos en una batería separada. **No confundir el stub de V2-24 con la aritmética real de feriados**.
- Los controles de Edge v76 y Deno de TypeScript se mantienen; un fallo bloquea el avance. Ningún resultado CI equivale a WhatsApp enviado.

## Secuencia del primer piloto (no ejecutada con «Avanza»)

1. Con orden **«Publicalo»** limitada al PILOTO, verificar SHA M221 y aplicar **V2-21 (RPC por producto aislada), V2-05 (calendario policy OFF), V2-22 (reloj en RPC V2), V2-24 (auto-release policy OFF)**. Verificar hashes, roles, rondas originales y política OFF después de cada migración.
2. Completar fuentes reales de feriados 2026/2027 y localidades del piloto con trazabilidad automática auditada. La IA Central concilia fuentes; ninguna fecha se inventa. Recién luego autorizar activación del reloj V2 para nuevas rondas.
3. Conectar la Preview V2 para SMS auténtico del comprador y consentimiento verificable de los dos proveedores del piloto. **No abrir signup público**, no leer cotizaciones de otra empresa.
4. Preflight del candidato Whapi v76 de SHA exacta; permitir solo rondas prospectivas y habilitar la política privada V2 + interruptor Edge **después** de comprobar envíos/consentimientos y poder desactivar el circuito.
5. Una ronda nueva real: comprador manda pedido (con zona o una sola pregunta de localidad), IA elige proveedores por productos reales, SQL V2 prepara, auto-release autoriza, MVP222 encola, Whapi despacha con lease, 2 proveedores envían originales, comprador ve solo respondedores con análisis, al cierre informe general; auditar antes de declarar 100%.

**Límites conocidos:** la ruta documental binaria todavía tiene preparadores y modalidad de calendario por reconciliar en V2; la prueba de este incremento cubre **texto y continuación de zona**. El disparo del despachador MVP223 sigue acotado a 2 trabajos por webhook, por lo que rondas con más de 2 destinatarios necesitan worker durable posterior. La V2 no está publicada ni operativa E2E hasta observarla realmente.

**Qué NO se hizo:** no cambios en Supabase real, Auth, Vercel, Edge activa, Whapi, SMS, registros o política de negocios. No se enviaron mensajes ni se recrearon rondas anteriores.
