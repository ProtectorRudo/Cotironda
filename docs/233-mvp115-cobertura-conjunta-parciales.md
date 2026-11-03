# MVP-115 — cobertura conjunta de dos presupuestos parciales verificados

**02/11/2026 · Issue #441 · Desarrollo NO instalado.** Amplía MVP108 sin permitir que una cotización parcial gane por total menor. Contrato docs/223, docs/230, docs/231.

## Problema y solución

Antes, si el arquitecto pedía *cemento* y *arena*, una oferta que tuviera solo cemento y otra que tuviera solo arena se consideraban ambas incompletas y no se elegía a nadie, aunque juntas fueran suficientes.

La selección del servidor ahora reconoce una tercera modalidad: `two_supplier_combination`. El algoritmo aplica ÚNICAMENTE a los dos negocios del piloto y SOLO después del cierre de cuatro días:

1. Solo toma presupuestos cuya **versión más reciente** tiene fuente íntegra comprobada, dos lecturas IA concordantes y suma de importes exacta. Si el proveedor mandó una corrección pendiente, se excluye la oferta anterior.
2. Por cada negocio coteja renglones con el pedido: **descripción exacta, familia, unidad, cantidad completa para ese renglón e importe literal comprobable**. Rechaza mapeos duplicados o ambiguos. Una cantidad de 10 bolsas no se combina con otra de 10 para cubrir un renglón que pidió 20: las unidades de un renglón no se fraccionan.
3. Si un negocio cubre todo, permanece la modalidad anterior `one_complete_alternative` o `two_complete_alternatives`.
4. Si **ninguno individualmente** cubre todo, pero cada uno cubre al menos una parte y la **unión de los artículos** cotizados cubre todos los del comprador, selecciona ambos como una *solución de cobertura conjunta*. Una coincidencia de algún artículo entre ambos no se usa para decidir un ganador por precio.
5. La selección es **por cobertura únicamente**. No se suman totales parciales para publicitar un precio más bajo, porque pueden incluir flete, IVA, embalajes o descuentos de distinto alcance. Es necesario analizar por separado el costo económico comparable de la canasta.

## UX sin engaños y privacidad

- El arquitecto recibe el mensaje: **«Estos dos negocios, con sus cotizaciones parciales, pueden cubrir juntos la lista solicitada. Ninguno cotizó el pedido completo por sí solo.»** La página privada muestra los contactos solo después de cerrar la ronda y del consentimiento de todas las partes, y advierte que IVA/flete/pagos/stock deben coordinarse directamente. No dice que son los más baratos.
- Cada proveedor recibe solo el número de WhatsApp del arquitecto (cuando ambas partes autorizaron); nunca recibe el número ni otros datos del segundo proveedor.
- Se reutiliza la bóveda cifrada AES-GCM/HMAC, el guardia contra rondas antiguas (MVP113), y la cola `at-most-once` de 3 avisos con revalidación del consentimiento justo antes de enviarlos. Revocar contactabilidad oculta los contactos.
- Los presupuestos originales no se modifican; sus renglones extras y totales declarados quedan registrados y anónimos conforme las reglas.

## Verificación ejecutada

- `supabase/piloto/mvp115_joint_supplier_smoke_rollback.sql`: PostgreSQL 17 Supabase PILOTO, migraciones MVP101–110 apiladas, tres escenarios: **2 completas**, **una completa/otra con cantidad insuficiente**, y **dos parciales con artículos distintos que cubren la unión** (20 bolsas cemento CPC + 5 m³ arena fina). **PASS**, `fully_reverted=true`.
- `supabase/piloto/mvp112_roundtrip_e2e_rollback.sql` ampliado a esos 3 escenarios: fuente ficticia, doble IA, aritmética, enlace anónimo, cierre por reloj, consentimiento de las tres personas, revelación buyer/worker con `joint_supplier_coverage`, 3/2 avisos únicos simulados, revocación. **PASS**, `fully_reverted=true`; no hay llamadas Whapi.
- `tests/unit/mvp115-complementary-supplier-combinations.test.mjs`: contratos SQL y mensajes reales construidos (sin transmisión): proveedor parcial no recibe número del otro, comprador no recibe un ranking económico falso; las alternativas completas mantienen los textos anteriores. Ejecutar CI GitHub antes de merge.

## NO_GO y alcance consciente

Este cambio **no** garantiza que la pareja elegida sea la más barata, ni resuelve IVA, flete, disponibilidad, pago o equivalencias de presentación. No divide cantidades de un mismo renglón. Se limita a los dos negocios del piloto, a máximo ocho ítems pedidos y a presupuestos de fuente comprobada. Los archivos PDF complejos, fotos o presupuestos con más de 25 renglones permanecen bajo revisión interna. El circuito real WhatsApp → archivo → distribución → cotizaciones → ranking económico → mensajes y página aún requiere instalación y pruebas con tres teléfonos; **NO está publicado**.

Siguiente requisito de producto: comparación económica sobre artículos realmente equivalentes, con formato de IVA/flete/descuentos/condiciones y asignación de hasta dos negocios sin omitir cargos. No prometer precios «mejores» hasta ese control. Para activar se requiere autorización explícita `Publicalo: PILOTO`, respaldo/reversión y aceptación documentada docs/223.
