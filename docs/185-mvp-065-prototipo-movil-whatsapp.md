# 185 — MVP-065: prototipo móvil WhatsApp de 4 participantes, cero envíos

**01/11/2026 · Issue #343 · code-only, no Vercel deployment.**

## Por qué
El usuario conectó su WhatsApp Business a Whapi (trial) y quiere poder **probar un recorrido de Cotironda lo antes posible**. No podemos decir que la integración está operativa mientras Supabase DEV histórica no tenga backup+restauración real (#175), esquemas D0xx comerciales, roles, catálogos y consentimiento reales, Vercel Preview ejecutando integración actual y un webhook accesible. La Preview existente es antigua (SHA `29f36d52`) y está protegida por Vercel Authentication; un POST Whapi no la atravesaría. **No tocar ni publicar producción sin «Publicalo».**

La captura de Whapi mostraba un token visible: respetamos la decisión informada del usuario de mantenerlo, pero **NUNCA copiarlo, incluirlo en código, variables de frontend, CI, logs o capturas**. Si desea rotarlo después, se reemplaza únicamente en almacén privado de secretos.

## Qué quedó listo EN CÓDIGO

Ruta de Next.js `/probar/whatsapp` (nueva, accesible desde la portada):
- Pantalla móvil con cinco momentos entendibles: mensaje del arquitecto, consulta de comercios, presupuestos originales, comparación responsable y cierre.
- Usa **el normalizador real MVP-058 y parser estricto MVP-028**, incluyendo lista en una sola frase y pregunta de localidad solo cuando falta.
- Simula a **1 arquitecto + 2 corralones + 1 pinturería**, catálogos ficticios, sin teléfonos reales. Reparte únicamente las líneas que cada comercio comercializa; distingue invitación de cotización efectiva.
- Carga textos ficticios realistas: corralón A cotiza cemento e hidrófugo, agrega **pallets vacíos + bolsón vacío + flete + descuento**, declara un TOTAL; corralón B envía oferta parcial con flete a convenir; pinturería C cotiza pintura. Los importes del ejemplo son inventados y se generan con cantidades del pedido de ejemplo.
- El presupuesto se muestra como **texto COMPLETO y literal**: nunca filtra, corrige, recalcula ni sobreescribe el total que escribió el comercio; muestra la línea TOTAL solo si existe un único total explícito reconocible, y alerta si varios/ambiguos. El texto CRLF permanece tal cual en el estado.
- Permite editar en una simulación el texto de un comercio; se registra una **nueva versión en memoria**. La versión anterior sigue intacta. Una vez editado el presupuesto, se invalida su cobertura automatizada previa en la demo para no producir precios falsos sin reprocesamiento.
- Muestra cobertura de rubros y posibles combinaciones de **máximo 2 proveedores**, no total económico engañoso (IVA no informado, cargos extra, flete condicionado), no botón adjudicar. Cierre simulado no revela teléfonos reales.
- **No conecta Whapi, no hace fetch, no usa credenciales, no guarda datos en servidor ni emite WhatsApps.** Ningún dato del usuario queda en la base de datos.

## Criterios de aceptación
`tests/unit/mvp065-prototipo-whatsapp-cuatro-telefonos.test.mjs`: parser de una frase, 1+3, selección por catálogo, comparación parcial y dos proveedores, original íntegro con extras/total, correcciones versionadas y sin sobrescribir, edición invalida la cobertura, sin inventar IVA o adjudicación, zona faltante, total ambiguo, CRLF, validación de input.

El build Next.js verifica ruta SSR/client, compatibilidad y estilos responsivos. Smoke/screenshot móvil y accesibilidad manual quedarán pendientes de una **Preview expresamente autorizada**. Una simulación funcional de navegador no acredita conexión real de WhatsApp ni conservación de archivos PDF/Excel.

## Pasos concretos para encender Whapi después
1. Hacer recuperable el ambiente de datos; o separar un ambiente nuevo de piloto luego de aprobación de recursos y costos; instalar migraciones auditadas, roles y RLS. No modificar la DEV histórica sin respaldo verificable.
2. Configurar acceso HTTPS de Whapi a un endpoint reducido **sin abrir el portal completo** (Vercel Authentication está activa); activar webhook secret custom header; usar el Channel ID en secreto de Preview y token Whapi solo en backend.
3. Registrar identidad del comprador y tres negocios, zonas, categorías/catálogos, consentimiento y contactos cifrados. Ensayar 1 mensaje entrante de texto; comprobar inbox cifrado sin envíos.
4. Habilitar ejecutor de comprador y emisor de invitaciones para solo 3 números explicitamente aceptados; cero reenvío automático de envío incierto.
5. Aceptar respuestas vía worker proveedor, con D093 original+total y versión; después PDFs/Excel/Word/imágenes originales inmutables en Storage privado. Mostrar vista comprador íntegra autorizada (Issue #339).
6. Comparación determinista con IVA/flete/pallets y coberturas, plazo y finalistas consentidos; no adjudicación interna.

**No se cambió Vercel, Supabase DEV ni producción ni se usó el API Token visible.**
