# 153 — MVP-033: localidad solo si falta, sin destino implícito

31/10/2026 · Issue #279 · rama `feat/mvp-033-zona-solo-si-falta`.

## Qué problema resuelve

El formulario de **primer pedido real** (`/mis-rondas`, MVP-028) obligaba a mostrar localidad como campo separado aun cuando el comprador escribía «Entrega en: La Plata» en su lista. Si faltaba destino, respondía con un mensaje genérico sobre materiales. Esto genera fricción y confusión, contrarias a UX-001.

## Cambio implementado (solo rama candidata)

- La pantalla comienza con **una lista de materiales y un botón**. No se requiere campo extra de localidad antes de analizar.
- Si la lista contiene una localidad válida, se usa esa localidad sin otra pregunta.
- Si la localidad falta, es inválida o hay dos destinos diferentes, aparece **una sola pregunta específica** por el destino. El comprador escribe la localidad y vuelve a presionar el mismo botón, que intenta registrar la ronda.
- Si el usuario corrige los materiales, se conserva una localidad que haya escrito en el campo. La extracción la contrasta con la lista: si el comprador luego incluye otro destino diferente, **no gana silenciosamente la localidad anterior**.
- Las líneas ambiguas y el IVA contradictorio continúan reteniendo la ronda **completa**, conforme al límite actual de MVP-028. No se pierden artículos ni se envían pedidos parciales. Esta es una limitación temporal del piloto, no la experiencia final pretendida.

## Invariantes preservadas

Sin cambios en D064 / SQL, datos guardados, RLS, integración de Whapi, identidad del comprador, límite de IA ni banderas. La validación definitiva sigue en el backend; el plan de aclaraciones es una capa UI, no autoriza por sí misma el envío. La UUID de solicitud se conserva para reintentos idénticos; cambiar un dato crea otra intención. Ningún proveedor recibe un mensaje en este cambio.

## Pruebas

- `tests/unit/mvp033-zona-solo-si-falta.test.mjs` comprueba destino presente/ausente/inválido, zona contradictoria, valor previo que no puede pisar un nuevo destino, línea dudosa, IVA contradictorio y plan inmutable.
- `apps/portal/scripts/smoke-buyer-text-pilot.mjs` exige que el SSR inicial NO muestre el campo de zona, y mantiene los ensayos de 401, 403, 400, 201 y cero invitaciones con identidades y API ficticias.
- GitHub CI debe comprobar typecheck de Next y dominio + unitarias + PostgreSQL17. **No afirmar PASS hasta verificar el resultado**.

## Límites y siguiente bloqueo

No hay navegación interactiva con comprador real ni despliegue nuevo. El respaldo cifrado auténtico y recuperación aislada de Supabase DEV (#175) continúan pendientes, y por eso no se aplicó SQL DEV ni se habilitaron rondas o mensajes Whapi. El flujo de archivos PDF/Excel/Word/fotos y la IA de producción siguen pendientes.
