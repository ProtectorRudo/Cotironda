# MVP-117 — solicitudes a proveedores de hasta 25 artículos, PDF multipágina fiel

**Fecha: 02/11/2026 · Issue #445 · desarrollo, NO publicado.**

## Hallazgo del cuello de botella

La tabla base `cotironda_piloto_privado.request_lines` del piloto acepta números de línea 1–200. Pero la lectura documental activa del laboratorio/IA acepta hasta 25 líneas; los controles privados del despacho por documento, el acuerdo de dos lecturas y el render PDF del proveedor estaban limitados a **8**. Eso impide un piloto real con un pedido de 9–25 productos y presiona a dividir o perder materiales, aun cuando los datos del comprador fueran correctos.

**Decisión:** sin límites artificiales de 8 para solicitudes documentales ya corroboradas, pero **no prometer «ilimitado»**. El alcance verificable siguiente es 1–25 ítems por solicitud; el límite técnico 25 queda visible como requisito de posterior procesamiento por lotes, lectura completa de fuente y costos controlados. No ampliar la cantidad de mensajes ni datos sensibles.

## Cambios de código

- `request-pdf.ts`: genera PDF real con árbol de páginas y streams independientes, con **8 filas por página**, numeración, fecha de cierre y localidad repetidas y renglones completos, orden y especificaciones intactas. Una solicitud de 9 materiales usa 2 páginas; una de 25 usa 4. No omite materiales ni altera cantidades. Rechaza 26 con error explícito, sin construir un PDF parcial. Sigue rechazando contactos, archivos sucios, números inválidos y caracteres no representables.
- `mvp099_document_partial_invites.sql`: controla 1–25 materiales totales y del subconjunto del proveedor, conservando el catálogo y zona verificados. Si el texto del outbox fuera demasiado largo, el texto indica que **la lista completa está en el PDF**, que siempre se genera de la instantánea privada del proveedor. No recorta el PDF ni sustituye la lista del comprador por otra.
- `mvp099b_dual_agreement_and_promotion.sql`: admite 25 renglones con correspondencia literal entre dos propuestas; todos deben estar en el registro fuente, tener cantidad, unidad, descripción y familia. No confirma automáticamente un pedido incompleto.
- `mvp100_contextual_missing_materials.sql`: la misma ruta de aclaraciones permite hasta 25 referencias de ítems, con regex explícita 1–25 y control de duplicados; **no** envía aclaraciones de forma automática.
- `mvp108_finalists_coverage_safe.sql`: conserva cobertura y selección final de hasta dos proveedores cuando la lista comprobada tiene 1–25 artículos. No afirma precio ganador ni compara totales parciales.
- Como las tablas y RPC MVP099 ya existen instaladas en el entorno PILOTO, `mvp117_upgrade_document_25.sql` es un **parche incremental explícito**: conserva las funciones privadas, ajusta el check 1–25 y reemplaza únicamente las RPC afectadas, sin habilitar envíos, flags ni acceso público. No repetir migraciones anteriores sobre una base ya instalada.

## Pruebas hechas

1. Node `mvp091-solicitud-pdf.test.mjs`: PDF con 1, 2, 8, 9 y 25 artículos; 26 rechazados; XRef y offsets de objetos; 4 páginas y **cada descripción exactamente una vez**, orden intacto, ciudad/plazo y pie por página, rechazo de números o contacto.
2. Node `mvp117-document-25-routing.test.mjs`: prueba de contrato de límite uniforme, origen privado, fallback de texto con PDF íntegro y parche incremental idempotente en intención de despliegue (no es idempotente si se aplica dos veces; requiere control de migraciones).
3. PostgreSQL 17 real Supabase PILOTO: dentro de **una transacción con ROLLBACK**, se aplicó temporalmente el parche MVP117, se generaron documentos sintéticos de 9 y 25 renglones, se comprobó acuerdo, ruteo a ambos negocios por catálogo, `request_lines`, `invitation_lines`, snapshots por proveedor, autorización y privacidad SQL. **PASS**. La comprobación final confirmó que el check real seguía limitando a 8 porque el parche se había revertido.
4. GitHub Actions: exigir aprobación de pruebas unitarias, Deno/Edge, PostgREST, aislamiento PG17, Next.js y sitio antes de marcar desarrollado; ninguna suite sustituye la prueba real Whapi.

## Lo que NO queda resuelto

- El modelo documental todavía limita a 25 ítems y 3 MiB, y no existe procesamiento por lotes o verificación independiente universal de PDF complejo, fotos/escaneos y Excel con fórmulas. Un archivo con más artículos puede necesitar **revisión interna**: el sistema no debe anunciar una solicitud que no haya leído íntegra.
- Los casos de aclaración extensa pueden exceder mensajes de WhatsApp; el mensaje debe ser resumido SIN perder el registro privado original y no presumir preguntas respondidas.
- La comparación económica de IVA, flete, descuentos, entrega, pago y disponibilidad todavía no está integrada como ranking general. El cierre con 2 proveedores es selección **por cobertura comprobada**, sin proclamar «más barato».
- El entorno instalado aún no tiene las RPC privadas MVP101–116 ni el nuevo worker de finalistas. **NO_GO** para tres teléfonos reales; primero revisión de PR, respaldo/reversión, instalación PILOTO autorizada, Edge actualizadas y ensayo externo.
- Los límites de costo y tiempo por mensaje son una protección operativa necesaria, no deben desactivarse «sin límites».

**Criterio de producto:** evitar fricción de usuario, sin inventar ni recortar ítems. Un piloto ampliado a 25 artículos necesita ser probado con pedidos reales y catálogo suficiente; los pedidos más grandes requieren procesamiento paginado de IA y almacenamiento verificado antes de estar listos.
