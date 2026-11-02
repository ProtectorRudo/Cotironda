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
