# MVP-076 — 4 días, anonimato y preparación segura del cierre (02/11/2026)

## Regla aprobada
El comprador envía por WhatsApp una lista. **Sin indicar plazo, la ronda dura 4 días corridos = 96 horas** desde su creación en el servidor. Si pide «Plazo de cotización: N días», puede elegir 3 a 7 días en la ruta legacy MVP053; nunca confundir plazo de entrega de materiales con plazo para cotizar.

**Antes del cierre:** el comprador ve artículos, cantidades y precios que hayan sido validados, pero únicamente como «Proveedor A», «Proveedor B»; no ve nombres, teléfonos, empresas, correos ni texto sin limpiar del presupuesto. Los proveedores no ven competidores. El **presupuesto original completo** se conserva en privado para auditoría y se respeta aun si contiene cargos, pallets, descuentos y notas. La vista anónima no debe reutilizar original_quote directamente: el proveedor podría haberse identificado o firmado en el propio documento.

**Después de los cuatro días:** se cierra el pedido; un comparador por rubro, cobertura y equivalencia técnica comprobable, IVA, flete, medios de pago, disponibilidad y condiciones identifica hasta dos finalistas **solo cuando es posible una comparación válida**. Es oportunidad de contacto, no venta adjudicada. Si hay empate en corte, importes ambiguos, ofertas parciales o consentimiento faltante, no anunciar dos ganadores falsos.

Cada finalista deberá recibir WhatsApp personalizado: «Tu propuesta quedó entre las dos finalistas» cuando realmente son dos (o «como propuesta finalista» si solo existe una), con el nombre y contacto **autorizados** del arquitecto. El arquitecto recibe a su vez el contacto autorizado de cada finalista. A quienes no fueron seleccionados **jamás** se les revela el contacto del comprador. No revelar datos a proveedores competidores.

## Código implementado en esta fase

1. `src/domain/plazo-cotizacion-mvp053.ts` cambia 5 → **4 días por defecto**. El texto explícito 3–7 se conserva. `supabase/sql/whapi_buyer_round_atomic_d081.sql` ajusta el default de compatibilidad al mismo valor, sin instalar esa migración histórica en otro entorno.
2. `supabase/piloto/mvp076_four_day_deadline_private.sql` agrega a las solicitudes reales del piloto `round_days=4`, `closes_at` y `closed_at`, con duración exacta (96 horas), inmutabilidad del vencimiento y cierre atómico idempotente `public.cotironda_piloto_close_due_v1`. Hasta 25 vencidas por llamada, con locks, y cancela invitaciones pendientes de las que cerró. La función **solo cierra**; no calcula ranking ni descubre contactos ni ejecuta WhatsApp. Solo `service_role` puede ejecutarla, no público / JWT de clientes. No configura cron por sí sola.
3. `supabase/piloto/mvp076b_deadline_whapi_guards.sql` protege ingreso del presupuesto del proveedor y salida de invitaciones después de `closes_at`. Llegadas tardías se conservan en inbox a revisión/no asociadas, sin incluirlas como ofertas válidas de la ronda.
4. `src/domain/anonimato-y-avisos-mvp076.ts` compone dos módulos **puros**:
   - `vistaPresupuestosAnonimosMvp076`: acepta únicamente un ledger económico seguro verificado y devuelve exclusivamente etiquetas anónimas más artículos, unidades y precios; nunca usa `original_quote`, IDs internos ni texto/metadata de vendedor. Un presupuesto no verificado aparece sin precios estructurados; NO inventa.
   - `prepararAvisosFinalistasMvp076`: usa `planificarFinalistasPorRubroMvp054`/D039/D022, solo tras cierre real y consentimiento explícito. Prepara textos de aviso para cada finalista y su comprador, sin datos de competidores. Devuelve `envioWhatsApp:false`. **Esta salida contiene datos personales: solo backend privado, jamás API pública, logs, JSON del cliente ni repositorio.** Los nombres y teléfonos de las pruebas son ficticios.

## Pruebas y resultado
- SQL transaccional `BEGIN; <MVP076>; <MVP076b>; <aserciones>; ROLLBACK;` sobre la base aislada `ilggkalaafhtiysyzlmg`: **PASS** 96 h, pedido preexistente intacto, recepción/claim/authorize con cierre, un pedido ficticio vencido pasa a cerrado una sola vez, cero revelación y cero envíos. Las pruebas SQL no dejaron cambios.
- Tests `tests/unit/mvp076-anonimato-cierre-avisos.test.mjs`: plazos 4/7 días; anonimato; rechazo de datos inyectados; dos finalistas con mensajes recíprocos; un solo finalista sin anunciar «dos»; cancelado/antes de cierre/consentimiento/baja/IVA/flete/empate/cobertura impiden mensajes. Estado de CI a verificar en commit final.
- Migración al piloto real solo tras tests/CI; mantener `integration_flags.whatsapp_outbound_enabled=false`, y ninguna llamada Whapi.

## Qué falta para **funcionar automáticamente de punta a punta**

**No declarar esto terminado**: todavía no hay un worker/cron real que ejecute `cotironda_piloto_close_due_v1` cuando vence una ronda, ni un ledger completo de precios desidentificados y equivalencias del presupuesto real, ni una comparación en backend con snapshot cerrado auditable, ni un registro del consentimiento **específico** para compartir contacto entre finalistas, ni directorio cifrado de destinatarios comprador+proveedores, ni un sender/outbox privado idempotente para los dos avisos recíprocos. El piloto aún tiene solo **una** cotización (Ailín); Nahuel todavía no entregó la segunda. Los mensajes están *preparados como algoritmo*, no entregados.

**Orden sugerido**: 1) segunda cotización + datos protegidos y consentimiento de cesión desde el alta; 2) fuente verificada line item ledger y comparación sin suposiciones (incl. IVA/flete); 3) snapshot/cierre idempotente privado; 4) outbox de revelación, Whapi con lista de contactos confirmada y pruebas reales de envío; 5) scheduler real autorizado y monitorizado; 6) anonimato en portal/buyer comprobado con prueba adversaria. Ninguna de estas tareas exige hacer click por parte del arquitecto si el consentimiento se registra antes.

## Ámbito
Solo código de rama y **base aislada Cotironda Piloto**, nunca Te Hice Esto, Cotironda DEV pausada, Vercel producción ni `main`. Issue #364.

## Instalación y verificación REAL en Supabase Piloto — 02/11/2026

**Aplicadas únicamente en ref `ilggkalaafhtiysyzlmg`:**
- `mvp076_four_day_deadline_private` — `success=true`.
- `mvp076b_deadline_whapi_guards` — `success=true`.

**Lectura SQL luego de instalar:** la solicitud WhatsApp del arquitecto creada `2026-11-02 04:34:00.325945+00` permanece `prepared`, `round_days=4`, `closes_at=2026-11-06 04:34:00.325945+00` (01:34 en Argentina), `closed_at=null`, 1 oferta guardada. Outbox: Ailín `cancelled` porque ya respondió; Nahuel `pending` porque todavía no lo hizo. No se alteró ningún presupuesto original ni la cola de Nahuel.

**Smoke de verificación posinstalación:** `supabase/piloto/mvp076_smoke_rollback.sql` → PASS: duración exacta 96 horas, plazo explícito 72 horas admitido, cierre anticipado bloqueado, cierre repetido 0, permisos público/auth sin función de cierre, estado original conservado, controles Whapi presentes, 0 mensajes y 0 revelaciones. El ensayo revirtió todos los datos sintéticos.

**Importante:** `cotironda_piloto_close_due_v1` es una RPC **lista para ser invocada por un scheduler seguro**, pero NO se configuró cron ni se está ejecutando automáticamente en el piloto. El guard de vencimiento en recepción y salida sí está instalado. El texto de WhatsApp de Ailín no fue interpretado como ranking real; no existe una decisión de finalistas ni mensajes enviados.
