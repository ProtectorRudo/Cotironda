# 134 — MVP-014: ofertas recibidas y rondas propias del comprador

31/10/2026 · Issue #241. **Desarrollo y laboratorio CI únicamente. No instalado en Supabase DEV ni producción.**

## Problema y solución

Hasta MVP-013 estaba probado el ingreso de presupuestos contra PostgreSQL 17 descartable, pero la página de comparación web todavía enseñaba un ejemplo fijo. El comprador necesita consultar sus rondas y los importes verdaderamente recibidos, sin ingresar identificadores ni hacer trámites extra.

Se incorporan:

- **/mis-rondas**: listado de las solicitudes de empresas donde el usuario autenticado es miembro activo, con acceso directo a las ofertas de cada ronda.
- **/rondas/[rondaId]/ofertas**: última versión registrada por proveedor anónimo. Se muestran precio unitario original, moneda, unidad, cantidad disponible, IVA declarado/no informado, flete, pago y plazo. Artículos sin monto aparecen claramente sin precio y la oferta se rotula parcial.
- **GET /api/rondas** y **GET /api/rondas/[rondaId]/cotizaciones**: lectura autenticada de los RPC privados, sin caché ni datos identificatorios. Respuestas inconsistentes, datos extra (teléfonos/identidad) o revocación de sesión fallan cerrado. No se exponen errores internos SQL.
- SQL en archivos de laboratorio: D060 amplía datos económicos sin suponer nada y la función buyer_round_list_mvp014 lista solo las rondas del comprador. Su función privada revalida la sesión mediante D025 y el SQL vuelve a filtrar membresía actual. No otorga SELECT directo sobre tablas privadas a clientes.
- Activación deshabilitada por defecto: exige COTIRONDA_ROUNDS_READ_ENABLED=true y COTIRONDA_QUOTES_READ_ENABLED=true, entorno Vercel Preview, registro empresarial deshabilitado, ref/URL exactos y publishable key. Producción responde 503.
- Pruebas Node y PostgreSQL 17: RLS entre empresas, miembro suspendido, sesión revocada, lista vacía, oferta parcial, IVA desconocido, campos extra, moneda inconsistente y no-cache.

## Límites actuales

**Ninguno de estos RPC está instalado en Supabase DEV**. No se están leyendo cotizaciones reales ni contactando a proveedores. Los ensayos se harán con datos ficticios en GitHub Actions.

El comparador determinista todavía no está conectado a esta vista y no se anuncia ganador ni total comparable. Faltan el alta real de rondas desde pedidos de comprador, el worker alojado, WhatsApp consentido y la IA de PDF/Excel/imagen. La exportación y restauración auténticas de DEV #175 siguen bloqueando instalación comercial.

Antes de activar la lectura en Preview, instalar tras gate #175, auditar roles/permisos y probar al menos dos empresas y un proveedor real de ensayo.

**UX aprobada:** pedido único, sin cursos ni «Confirmo» al corralón; precios recibidos con condiciones faltantes visibles y adjudicación solo manual.
