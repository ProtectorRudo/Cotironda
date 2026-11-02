# MVP-085 — Landing con identidad Cotironda azul

**Fecha:** 02/11/2026 · Issue #384 · Rama \`feat/mvp-085-landing-identidad-azul\` sobre \`feat/mvp-084-web-publica-actualizada\` (PR #383).

## Decisión de marca

Adoptar la ficha entregada por el usuario como identidad visual: isotipo **C** de azul noche y azul brillante, marca «Cotironda», lema **«La nueva forma de cotizar»**. La marca es B2B multirrubro, NO restringir el diseño a materiales de construcción, aun cuando el ensayo actual utiliza presupuestos ficticios de materiales.

Paleta:
- Azul Noche \`#071D49\`: identidad, títulos, secciones corporativas.
- Azul Principal \`#0E5EFF\`: botones, acentos y resaltados.
- Celeste Brillo \`#48C8FF\`: matiz sutil del isotipo y barra de comparación.
- Blanco \`#FFFFFF\`: base limpia y espacios abiertos.
- Gris Claro \`#E9EEF5\`: divisores y superficies secundarias.
- Gris Texto \`#5F6B7A\`: textos auxiliares.

## Cambios realizados

- \`site/brand-mark.svg\`: recreación vectorial local del **símbolo C** usando como referencia directa la imagen de identidad del usuario. No depende de URLs externas, bibliotecas, redes ni fuentes. **Es un calco vectorial aproximado del motivo de la marca, no un fichero maestro original**: si llega el SVG oficial, se sustituye manteniendo nombre/rutas.
- \`site/index.html\`: una portada minimalista, hero blanco, lema, navegación breve, tarjeta anónima Cotironda, 3 pasos, sección de ventajas corporativa azul noche, comparador ficticio y cierre simple. Marca legible también en móvil.
- \`site/styles.css\`: CSS responsive en paleta oficial; animaciones suaves, foco visible y reducción de movimiento. Sin dependencias remotas.
- \`site/app.js\` **SIN MODIFICACIONES**: botones un proveedor/dos proveedores siguen mostrando coberturas y precios deterministas del ensayo; la cifra pequeña de una oferta parcial no se utiliza como ganador completo.
- Fuente de ejemplo muestra **materiales, pallets no solicitados, flete, descuento y total declarado**, indicando IVA no informado y que los valores son ficticios.
- No hay WhatsApp activo, registros, pagos ni API para aceptar documentos. La landing contiene el disclaimer obligatorio \`DEMOSTRACIÓN · PILOTO EN DESARROLLO\`; no implica producción del piloto.

## Pruebas / aceptación

- \`site/tests/identity.test.mjs\`: paleta y logo, favicon, rutas, responsive a 810/520 px, accesibilidad, integridad de concepto comercial, prohibición de formularios/API.
- \`site/tests/contract.test.mjs\`: contrato preexistente de sitio y cálculo de 13 materiales no engañoso.
- \`scripts/test-public-demo.mjs\`: contrato de MVP084 del flujo WhatsApp-first, anonimato, cuatro días y consentimiento, estados de demo, simulación un/dos proveedores.
- GitHub Action de web pública y acción de verificación del sitio deben terminar PASS. Probar Vercel Preview identificando **branch y SHA exactos**, sin exponer datos reales.

## Limitaciones

- Este PR va **apilado sobre #383**; no fusionar directamente a main sin aprobar el conjunto y sin resolver los status checks protegidos del repositorio.
- **No es la publicación**. La autorización anterior «Publicalo: portada institucional» se aplicó al diseño anterior de #383; este rediseño nuevo requiere aprobar la versión concreta antes de producir/cambiar DNS.
- El dominio \`cotironda.com\` y \`www\` están asociados a Vercel, pero DNS Hostinger aún no apunta a Vercel; certificado TLS personalizado pendiente. No cambiarlo sin producción lista.
- El portal real y la recepción/procesamiento de archivos/WhatsApp siguen separados de esta landing estática. Los últimos módulos piloto de backend no se integran aquí; sin credenciales ni mensajes salientes.



## Revisión comercial: ahorro como beneficio principal (02/11/2026)

A pedido del propietario, la promesa central del sitio no debe limitarse a «presupuestos claros» ni describir únicamente un software de cotizaciones. El motivo de uso del comprador es **poder encontrar mejores precios y reducir el gasto de sus compras**.

- Hero principal: **«Comprá mejor. Ahorrá más.»**, con el lema de marca **«La nueva forma de cotizar»** conservado en el encabezado y el resto del sitio.
- Explicación visible: un pedido por WhatsApp, consulta a distintos proveedores pertinentes y comparación de costos completos para elegir la oferta conveniente.
- Beneficios/3 pasos/comparador/cierre explican el ahorro potencial, no solo la tecnología o la prolijidad del presupuesto.
- SEO descriptivo y OG destacan precios y oportunidades de ahorro.
- **Límite de honestidad comercial:** no se promete el precio más bajo del mercado ni un porcentaje fijo de ahorro. La comparación justa se realiza solo sobre productos, cantidades y condiciones equivalentes; cobertura, IVA, flete y forma de pago pueden modificar el costo efectivo. El ahorro depende de ofertas efectivamente recibidas.
- **Sin cambios funcionales** en `site/app.js`: los 13 materiales y sus cálculos permanecen idénticos, no se manipulan datos para mostrar ahorros ficticios.
- La web sigue informando «Demostración / piloto en desarrollo», sin aceptar presupuestos reales.

**Criterios de aceptación:** «ahorrar» y «mejores precios» visibles en la primera pantalla; meta description y Open Graph consistentes; aclaración de comparabilidad y no garantía; mantenimiento de identidad, privacidad, accesibilidad, simulación y avisos. Prueba `site/tests/identity.test.mjs` ampliada.

**Estado:** cambios en rama de PR #385, sin integrar a main ni publicar en producción o configurar DNS. Revalidar CI y vista previa de HEAD actualizado antes de autorización de publicación.

## Resultado de la verificación del rediseño

- Último commit de código validado `2e87e02c96fd3aaa4ea5402588d17081bcc52f68`: GitHub Actions **2/2 PASS** — sitio `41448600405` y fidelidad/simulación `41448600520`. La comprobación existente cubre contratos de funcionalidad y la nueva prueba de identidad añade paleta, logotipo, móvil, accesibilidad y prohibición de captura de datos reales.
- Vercel proyecto `cotironda` generó algunos previews de commits *anteriores* de la rama. El intento explícito de desplegar **el HEAD exacto y completo** retornó HTTP **402** por cuota `api-deployments-free-per-day` en plan Hobby. Por tanto **no se validó visualmente el HEAD final en Vercel y no hay URL nueva apta para presentar como versión final**.
- Ningún despliegue Production nuevo, sin alias de dominio propio ni cambios de DNS en Hostinger. Permanecen los datos ficticios.
- Para publicar el rediseño, esperar disponibilidad de cuota o resolverla por los controles del propietario, desplegar SHA de release explícita, inspeccionar página/CSS/JS/SSL y obtener autorización `Publicalo` para esta nueva versión.


## MVP-086 — Implementación del mockup aprobado y autorización a publicar (02/11/2026)

El propietario aprobó expresamente el mockup «Comprá mejor. Ahorrá más.» y solicitó crear la página real y publicarla. Se conservó el producto web estático aislado en Vercel `cotironda`, diferente del portal DEV, para evitar publicar datos o servicios del piloto antes de validarlos.

**Pantalla entregada**: navegación «Cómo funciona / Ahorro inteligente / Comparador / Demo», hero con valor de ahorro, tarjeta de presupuesto anónimo, tres chips comerciales flotantes, franja de tres beneficios, tres pasos de WhatsApp, sección corporativa azul con fidelidad/comparabilidad/privacidad, comparador interactivo de 13 artículos y cierre centrado. Se utilizaron íconos SVG locales, sin dependencias externas, imágenes remotas ni credenciales.

**Fidelidad de presupuesto**: la tarjeta es ficticia, pero sus importes se conservan exactamente y cierran en ARS 234.000: 168.000 + 24.000 + 18.000 + 36.000 − 12.000. Incluye pallets, flete y descuento, y aclara que el IVA no fue informado. El comparador funcional de 13 ítems **no se modificó**: una oferta parcial no es considerada oferta más barata por su menor total.

**Protección comercial**: sin formularios de recepción, WhatsApp activo, credenciales, precios reales ni promesas de ahorros garantizados. El beneficio se expresa como oportunidad de ahorro sujeta a ofertas comparables (cobertura, flete, IVA y condiciones). El sitio mantiene la advertencia de piloto en desarrollo.

**Criterios de aceptación / pruebas**: `site/tests/approved-design.test.mjs` verifica secciones y navegación del mockup, suma de presupuesto, avisos legales y ausencia de formularios/integraciones; regresiones `site/tests/identity.test.mjs`, `site/tests/contract.test.mjs`, `scripts/test-public-demo.mjs`. Revisar en Vercel Preview en móvil y escritorio, estado GitHub CI, producción y dominio.

**Despliegue**: solo proyecto Vercel `cotironda`, no `cotironda-portal-dev`. GitHub `main` es fuente de producción. Los dominios apex y www ya están agregados al proyecto, pero Hostinger administra DNS; hay que comprobar A y CNAME en su panel antes de asegurar acceso desde `cotironda.com`. No modificar registros MX, TXT, ni cambiar nameservers de todo el dominio.
