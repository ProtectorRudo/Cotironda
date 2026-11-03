# MVP-097 — Dejar de limitar comercialmente el piloto y recordar la localidad

02/11/2026 · Issue #404 · Solo Cotironda PILOTO (sin publicar en producción)

## Datos comprobados
- El arquitecto envió una **imagen JPG de 127.213 bytes** a las 16:43:59 ART. Se archivó `stored`, SHA256 confirmado, `review_state=suggested_only`.
- OpenAI devolvió `buyer_request` con **3 renglones propuestos** (no verificados contra el original en pantalla): `10 Cemento`, `2 Arena`, `288 Huecos del 12`. Los tres están sin unidad explícita; la localidad también está ausente. **No se creó una ronda** ni se envió a un proveedor.
- Los límites originales del laboratorio (8 archivos/día, 2 lecturas documentales/día, 12 intentos IA texto/día, 5 respuestas WhatsApp/día) eran restricciones visibles y demasiado bajas para el negocio.

## Cambios
1. Configuración privada `cotironda_piloto_privado.operational_caps_mvp097` ajustable por operaciones: **500** adjuntos/día/contacto, **100** interpretaciones documentales/día/contacto, **200** consultas IA texto/día/comprador y **100** respuestas automáticas/día/comprador. Son cortacircuitos de abuso/costo, **no cupos que se venden**. No se requiere ningún paso adicional en WhatsApp. Conservamos límite seguro por archivo, permisos, consentimiento, idempotencia, despachos auditados y separación de producción. Antes de comercializar la promesa de solicitudes ilimitadas de uso razonable, medir costos y adoptar un presupuesto global de gasto efectivo. Nunca afirmar que los cupos son literalmente infinitos.
2. Después de leer una imagen/documento genuino de un comprador con ítems y sin zona, Cotironda envía **una sola pregunta aprobada**: «¿En qué localidad se entregan los materiales?» únicamente si el webhook está autenticado, el archivo privado se conservó, OpenAI entregó JSON válido, SQL confirma rol de comprador consentido y el ledger autoriza un único envío. No pide confirmación para cotizar; pide solo dato vital faltante. No envía preguntas a proveedores.
3. Cuando responde la localidad en un mensaje breve, el webhook guarda esa respuesta en el **documento original pendiente**, con huella criptográfica del mensaje de origen, sin sobrescribir el resultado de IA, sin hacer que el arquitecto reenvíe el archivo. SQL la asocia solo si existe **un único** documento previo del comprador al que se le pidió zona y hay WhatsApp auténtico. Si hay varios pedidos a la vez o dudas, evita asociar una ciudad equivocada.
4. No genera invitaciones desde el resultado de IA hasta implementar **validación documental original 1:1, identificación por familia y zona real, proveedores que efectivamente comercializan TODOS los artículos correspondientes**, y registro de unidades/precios sin inventar. No se silencia un ítem no reconocido ni se compara precio total de ofertas parciales. La asociación de localidad por sí sola NO equivale a un pedido listo.
5. El mensaje precedente de ejemplo `La Plata` no era un pedido nuevo: el sistema lo interpreta como respuesta a una imagen solo si hay documento pendiente único, por seguridad contra cruces de conversaciones.

## Evidencia y pruebas
- `tests/unit/mvp097-sin-friccion-documentos.test.mjs`: parseo cuidadoso de localidad, evitar saludos/precios/pedidos como si fueran direcciones, código enlaza imagen + texto y cupos privados.
- `supabase/piloto/mvp097_smoke_rollback.sql`: valida permisos, cupos, archivo simulado, 1 pregunta por mensaje, respuesta `La Plata`, no sobrescribir y **0 nuevas rondas**, con `ROLLBACK` después. PostgreSQL 17 real.
- CI 6/6, migraciones y funciones PILOTO requieren verificación antes de declarar operación real.
- La imagen enviada antes de implementar esta función **no activa un mensaje retroactivo**: no reejecutamos WhatsApps por riesgo de duplicados.

## Pendiente para verdadero extremo a extremo
- Unificar multi-mensaje + documental y envío por rubro/catálogo con comparación literal y de cantidades. Validar por fuente sin exigir confirmaciones; si no hay zona, pedir solo zona.
- Proveedores: recepción de presupuestos en PDF/Excel/foto, extracción **fiel de todos los conceptos, IVA, flete, cargos, pallets/bolsones**, estructura anonimizada propia y ranking determinista.
- Cierre de ronda, aviso fiable hasta 2 finalistas, consentimiento mutuo, seguimiento y pruebas E2E reales completas.
- Reemplazar el gate de piloto (un comprador/dos negocios) por altas dinámicas con control de identidad. No ampliar a contactos no autorizados.
- Control global de gasto OpenAI y reintentos reconciliables. La capacidad no debe depender de intervención manual del equipo.
