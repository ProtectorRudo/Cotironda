# MVP-084 — Sitio público coherente con Cotironda WhatsApp-first

**Fecha:** 02/11/2026 · Issue #382 · Rama `feat/mvp-084-web-publica-actualizada`, basada en `main`. **NO desplegado en producción.**

## Corrección necesaria antes de activar cotironda.com

El sitio estático `site/index.html`, actualmente desplegado como demo antigua en Vercel `cotironda`, describía un flujo desactualizado:
- El arquitecto debía revisar cada lista y adjudicar manualmente desde la plataforma.
- El proveedor necesitaba aceptar la invitación y confirmar el presupuesto con pasos extra.
- Parecía centrado solo en corralones/obra, sin expresar con claridad que será por WhatsApp.
- No explicaba los cuatro días de anonimato y los hasta dos finalistas consentidos.

Se actualizó la portada manteniendo el comparador ilustrativo y su JS determinista. Ahora expresa el **modelo APROBADO** (todavía en desarrollo):
1. El comprador podrá mandar texto/PDF/Excel/foto por WhatsApp; el único dato vital a solicitar es zona de entrega si falta.
2. Cotironda clasificará por catálogo y zona; proveedores podrán cotizar por WhatsApp sin tener que ingresar ni confirmar nuevamente.
3. Presupuestos originales protegidos y plantilla propia anónima, con **todos** los renglones literales, extras, fletes, descuentos y total declarado.
4. Ronda de cuatro días por defecto y, **si es posible validar comparabilidad y consentimiento**, hasta dos ofertas finalistas con contacto recíproco, nunca adjudicación automática.
5. La página deja explícito que **todo es demo con cifras ficticias y no recibe pedidos reales**. No tiene botones de WhatsApp operativos ni formulario de registro.

## Verificación

`scripts/test-public-demo.mjs` prueba el copy aprobado, rechazo de promesas engañosas, IDs únicos de controles y cálculo con fletes en dos opciones mediante DOM simulado. CI propuesto en `.github/workflows/site-public-check.yml` (Node 22, sin dependencias y permisos solo lectura).

## Lanzamiento pendiente

NO poner `cotironda.com` a apuntar al demo anterior ni a la rama sin verificar. Antes: CI PASS y revisión visual móvil/desktop de una preview, publicación de commit explícitamente aprobado; luego actualizar A y CNAME en Hostinger según `docs/204` en la rama de MVP083 y verificar HTTPS/308. Aún faltan vista real del comprador, autorización de propuestas y pipeline de archivos y mensajería de punta a punta. Esta landing pública no es el piloto.

No se alteran Whapi, Supabase, Vercel production, zonas DNS ni proveedores.
