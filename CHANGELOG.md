## MVP-086 — Portada real basada en mockup aprobado, pendiente de validación final de publicación (02/11/2026)
- Web estática de Cotironda alineada al diseño aprobado: hero «Comprá mejor. Ahorrá más.», presupuesto privado ilustrativo, tarjetas flotantes, franja de beneficios, pasos de WhatsApp, comparador interactivo y cierre centrado.
- Diseño adaptable, iconografía SVG local, presupuesto ficticio que suma ARS 234.000, sin tocar el cálculo real del comparador de 13 productos ni activar datos/integraciones.
- Pruebas nuevas del diseño, privacidad, suma y mensaje de ahorro responsable. Publicación limitada a Vercel `cotironda`, DNS Hostinger revisado por separado.

## MVP-085 — Ajuste de propuesta de valor: ahorro y mejores precios (02/11/2026) — Sin publicar
- La portada ahora prioriza «Comprá mejor. Ahorrá más.»; se ajustaron SEO, beneficios, 3 pasos, comparador y cierre para explicar la búsqueda de mejores precios.
- Mensaje responsable: ahorro potencial entre ofertas comparables, nunca mínimo universal ni ahorro garantizado; costos completos con IVA, flete y cobertura.
- Pruebas de copy económico en `site/tests/identity.test.mjs`, sin modificar lógica JS, presupuestos ficticios, integraciones ni DNS. Ver `docs/206`.

## MVP-085 — Landing minimalista con identidad azul Cotironda (02/11/2026) — Sin publicar
- Creado recurso vectorial local del isotipo C desde la ficha de marca entregada por el usuario; nueva portada blanca/azul noche y acentos azules con jerarquía simple.
- Rediseñado ejemplo de presupuesto anónimo fiel con pallets, flete, descuento y total declarado; conservado comparador JS y aviso de simulación.
- Tests de identidad, privacidad, responsive y accesibilidad. Sin integrar APIs, WhatsApp, producción ni DNS. [docs/206](docs/206-mvp-085-identidad-visual-landing.md).

## MVP-084 — Landing corporativa coherente con flujo WhatsApp-first (02/11/2026) — Sin publicar
- Corregida portada de `site/` para indicar pedido WhatsApp, clasificación por rubro/catálogo, cotización sin confirmaciones extras, plantilla anónima fiel y hasta dos finalistas consentidos tras cuatro días.
- Se mantiene simulación de datos ficticios sin formulario, licitaciones reales ni servicios activos. Agregadas pruebas Node del copy y cálculos y workflow de CI PR para la página estática. Ver docs/205.

# Registro de cambios

## [Sin publicar] — Etapa 00
- Diseño de producto, reglas de licitaciones, IA, mensajería, ranking y seguridad.
- Roadmap y criterios de prueba iniciales documentados.
- **No existe todavía una aplicación ni se han conectado servicios.**
