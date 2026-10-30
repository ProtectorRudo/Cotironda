# 86 — Etapa 03 / D023 propuesto: rondas y ofertas versionadas OFFLINE

**30/10/2026 · Issue #145 · rama `feat/03-rounds-offer-versions`, apilada sobre D022.**

## Producto
Módulo puro TypeScript `src/domain/rondas-offline.ts` con transiciones deterministas y explícitas, sin usuarios, HTTP, SQL, IA, WhatsApp ni archivos.
- Creación de ronda **programada** con pedido cuantificado y hasta diez invitados de ID anónimo, autorización de distribución otorgada una vez al enviar la lista, inicio y vencimiento UTC.
- Comprador abre durante ventana configurada. Proveedor invitado guarda un borrador por revisión con control optimista `revisionEsperada`. El borrador puede contener precio/IVA o flete faltante; aún **no** es oferta comparable.
- Proveedor confirma **esa revisión** para generar una versión `1,2,...` con marca `confirmada:true`. Reconfirmar revisión, modificar la versión anterior o usar revisión obsoleta falla cerrado. Se conserva una secuencia inmutable.
- Cierre por comprador o sistema **solo al vencer el plazo**. Congela una comparación D022 usando **exclusivamente la última versión confirmada de cada invitado**; borradores posteriores nunca reemplazan datos confirmados.
- Cancelación autorizada por comprador antes del cierre; sin reapertura ni publicación.
- Idempotencia de evento por ID y contenido+autoridad: un segundo evento igual devuelve estado idéntico. Un evento con mismo ID y distinto contenido o autor se rechaza. Los eventos tardíos o fuera de orden fallan, y no se admiten versiones nuevas luego de vencimiento.
- Salida de comparación conserva reglas del D022: cobertura de ofertas parciales separada de ranking, IVA/flete/mínimos explícitos, monedas/pagos/plazos segregados, máximo dos proveedores asignando renglones íntegros. Nunca adjudica ni revela contacto.

## Contrato de confianza
**Importante:** el módulo no autentica a una persona. `autoridad` **debe inyectarla un servidor seguro**, derivada de la sesión vigente, empresa, rol y permiso sobre esa ronda/invitación. Si se expone el reducer a payloads arbitrarios, un atacante puede declarar falsamente `rol:'comprador'`. Por eso está prohibido usarlo directamente como endpoint. La marca `equivalencia:'verificada'` debe provenir de un validador técnico independiente/autorizado, no del formulario de proveedor ni de una respuesta IA. El comparador valida formatos, no certifica equivalencia técnica.

El estado devuelto se congela recursivamente y se duplica el borrador entrante para evitar alteraciones accidentales en memoria. **Esa inmutabilidad NO sustituye transacciones SQL ni bloqueos concurrentes:** el repositorio deberá almacenar eventos con ID único, versión esperada, CAS/serialización y trazabilidad; RLS y ownership por empresa quedan pendientes.

## Límites deliberados
- Sin antifraude, invitaciones reales ni opt-in verificado en servidor; solo IDs anónimos.
- Sin envío Whapi, contactos, datos personales, PDFs, proveedores reales, adjudicación, pagos, desbloqueo de identidad o ejecución remota.
- El protocolo de cierre exige expiración; reapertura y cierre anticipado **no están aprobados comercialmente**.
- Duración técnica del simulador: máximo 30 días, **no** decisión de plazos del servicio.
- Un borrador no obliga a conocer precio, IVA o flete; cotización confirmada incompleta queda fuera de ranking.
- No se optimiza reparto de una misma línea entre dos proveedores; no se proclama óptimo global.
- No se almacena nada en Supabase. No se altera el laboratorio IA ni sus dos reservas restantes.

## Pruebas
`tests/unit/rondas-offline.test.mjs` cubre:
- Creación/autoridad de apertura, borrador, confirmación, cierre y cancelación.
- Primera y segunda versión, independencia del histórico, congelamiento y copia ante mutación.
- Duplicados idénticos, colisiones de IDs, revisión obsoleta, confirmación repetida.
- Proveedor ajeno, actor comprador intentando cotizar, sistema sin permiso de apertura.
- Plazos UTC estrictos, cierre prematuro, cambios tardíos, cancelación irreversible.
- Oferta incompleta y alternativa no homologada conservadas sin inventar datos económicos.
- Comparación con dos proveedores, cero exposición de contactos, campos inesperados/PII.
- Protocolo acotado de hasta 10 invitados.

## Antes de activar una ronda real
Diseñar migraciones SQL, tenants y RLS, invitaciones sólo por catálogo/zona/opt-in, confirmaciones server-side, snapshots y almacenamiento inmutable, deduplicación concurrente, expiración por reloj confiable, política de cierre/reapertura, conservación legal, pruebas de acceso cruzado; conectar al D022 detrás de la misma autorización y posterior aprobación de piloto. Mantener PR draft y no publicar.
