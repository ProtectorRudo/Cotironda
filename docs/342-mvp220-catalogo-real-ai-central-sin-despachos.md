> **Actualización ADR 346 (05/11/2026):** la confirmación formal de catálogo ya NO es requisito para **invitar a cotizar** a un proveedor con consentimiento y productos registrados. Se conserva la marca real `catalogue_confirmed_at` sin inventarla y se siguen validando identidad, zona, existencia de la línea y cambios de precios. Ver [docs/346](346-mvp224-invitaciones-con-catalogo-registrado-sin-friccion.md). La restricción anterior en este documento queda sustituida solo para invitaciones.

# MVP220 — Conexión real entre IA Central y catálogos de Supabase

Fecha: 2026-11-05. Alcance: desarrollo y pruebas reversibles en
`cotironda-piloto`; **no se instaló permanentemente la RPC ni se envió WhatsApp**.

## Evidencia del problema

1. `cotironda_piloto_receive_whapi_v1` y
   `cotironda_piloto_prepare_document_mvp099` exigen todavía
   `family_code` para crear solicitudes e invitaciones. Es el cuello de
   botella que evita que la IA resuelva lenguaje libre.
2. En `cotironda_piloto_privado.catalogue_lines` hay 53 entradas para
   Ailín y 53 para Nahuel (43 `curated_family` cada uno).
   Ambos tienen consentimiento de contacto, pero
   `participants.catalogue_confirmed_at IS NULL` para los dos.
   No interpretar que `curated_family` equivale a confirmación del negocio.
3. `cotironda_piloto_pdf_snapshot_mvp091` incluye **todos** los renglones
   para pedidos de texto sin `document_sources_mvp099`. Por lo tanto,
   con una lista multirubro puede enviar artículos de electricidad al
   corralón. Requiere corrección de filtro por proveedor antes de activar.

## Implementación de esta rama

- `supabase/piloto/mvp220_ia_catalogo_por_rubro_privado.sql`:
  nueva RPC `public.cotironda_piloto_ia_catalogo_mvp220`. Lee catálogos
  fuente por empresa y localidad solo si el comprador es válido y
  consentido. Las líneas incluyen descripción y código heredado
  únicamente como *información*, sin exigirles coincidencia léxica.
  Devuelve `catalogoConfirmado` real y distingue la falta de
  confirmación de los catálogos existentes.
  `SECURITY DEFINER`, `search_path=''`, permiso EXCLUSIVO
  `service_role`; `anon` y `authenticated` no pueden ejecutarla.
  Límite honesto de 25 proveedores × 150 líneas c/u, sin truncar.
- `src/domain/ia-central/catalogo-supabase-mvp220.ts`:
  verifica estructuras/duplicados, y utiliza un modelo para clasificar
  TODOS los productos comerciales en rubros amplios. Controla que
  número de línea y **descripción original sean exactos**; una
  clasificación con omisiones, agregados o fuente modificada se
  rechaza. `activo=false` para catálogos sin confirmar.
- `src/domain/ia-central/planificador-piloto-mvp220.ts`:
  orquesta en memoria el mensaje de comprador verificado,
  las dos lecturas de IA, la RPC, la clasificación de catálogos y
  el enrutador semántico v2. Devuelve IDs y líneas verificadas como
  plan de trabajo. NO crea rondas, NO emite PDFs, NO accede a
  teléfonos ni puede llamar a Whapi.
- `tests/unit/mvp220-catalogo-real-orquestador.test.mjs`:
  simulaciones de IA/RPC con comprador y proveedores,
  doble lectura de fuente, mercado multirubro y permiso;
  frena cuando todos los catálogos están pendientes.
- `supabase/tests/ci/mvp220-ia-catalogo-pg17-rollback.sql`:
  rol `anon/authenticated/service_role`, comprador, dos proveedores,
  tercero revocado y catálogos de distinta clasificación. Comprueba
  que no se filtran contactos, que se mantienen todas las líneas,
  que se revoca acceso público y que >150 devuelve estado de exceso.
  Se ejecuta en PostgreSQL 17 aislado y revierte al terminar.

## Prueba directa en el Supabase PILOTO

Se ejecutó `BEGIN; <SQL fuente>; DO verificación; ROLLBACK;` en
el proyecto `ilggkalaafhtiysyzlmg`. Resultado sin errores:
- Comprador de prueba autenticado por HMAC + consentimiento.
- 2 proveedores, 53 artículos por cada uno (106).
- Ambos `catalogoConfirmado=false` (no se los habilitó ficticiamente).
- Los roles públicos carecen de EXECUTE, service_role lo tiene.
- HMAC no reconocido = `not_authorized`.
- HMAC inválido = `invalid_input`.
- Ninguna función quedó instalada después del rollback.

## Bloqueos siguientes — NO anunciar piloto E2E

1. Instalar RPC en PILOTO solo después de revisar CI y autorizar
   el despliegue de esta revisión.
2. Obtener confirmación válida de la lista de cada proveedor piloto;
   la clasificación hecha por IA NO es consentimiento comercial.
3. Persistir rubro del pedido y correspondencias verificadas
   fuente→proveedor→línea en una transacción con controles de
   identidad, versión, zona y deduplicación.
4. Modificar el snapshot PDF para filtrar por esa asignación, sin
   modificar comportamiento de rondas históricas.
5. Integrar el nuevo motor con el webhook firmado mediante una
   bandera controlada y presupuesto de API; no reenviar eventos
   inciertos o ya procesados.
6. Probar WhatsApp real de extremo a extremo, cotizaciones, cierre,
   originales y ranking por rubro antes de cerrar #529/#597.

**Advertencia técnica:** esta fase no confirma que la IA acierte
todas las equivalencias comerciales. Antes del envío habrá que
probar falsos positivos de producto y comparación de unidades,
no solamente que la línea del catálogo existe.
