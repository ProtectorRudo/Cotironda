# MVP179 — Redirección segura del seguimiento del comprador al frontend probado

**04/11/2026 · solo desarrollo + staging aislado de prueba · #529/P0-B2r y #528.** Rama `feat/mvp179-pilot-tracking-redirect-preview` sobre PR #554.

## Confirmaciones antes de modificar
- Vercel `cotironda-seguimiento-vista-piloto`: Preview de **commit exacto** `be809adc43f320e0e259db529258f6c1f1f176d1`, deployment `dpl_3xDzpcGMJNhopR83ANBXTZcNtmCd`, estado **READY**, SIN SSO.
- GET público REAL `/seguimiento` → 200 `text/html` 2.423 bytes, incluye `resultsSection` y `coverageSection`. GET `/site.js` → 200 `application/javascript` 10.829 bytes, incluye protecciones de revocación; GET `/site.css` → 200 `text/css` 4.948 bytes. GET `/api/estado` → 405; POST con token FICTICIO de 64 ceros → 200 JSON `{"state":"not_found"}`. Se verificó contenido, no solo código HTTP.
- Alias genérico del proyecto no probado como estable: GET respondió 404. Alias de rama actual respondió 200 con vista nueva, pero puede actualizarse con nuevos commits. Por eso para el piloto se fija la **URL inmutable de la Preview exacta**.
- Edge `cotironda-piloto-seguimiento` v10 ACTIVE; se cotejaron sus **8 archivos** con GitHub: la propuesta cambia **una única línea Location GET**. POST, token SHA-256, cobertura privada y privacidad de finalistas no se modifican.

## Cambio
Archivo `supabase/functions/cotironda-piloto-seguimiento/index.ts`: GET HTTPS 302 redirigirá a `https://cotironda-seguimiento-vista-piloto-8bfvf7vu1.vercel.app/seguimiento`, exclusivamente si el request carece de query. El token se transmite en el **fragmento #** del navegador y se consulta mediante POST al proxy same-origin. No incluir token en query, logs ni URL Location.

## Criterios de aceptación
1. Test de contrato del GET/redirección y privacidad POST, más CI Node/PG/PostgREST/Next.js.
2. Desplegar copia exacta de los 8 archivos en función de staging separada, preservando la función activa v10; GET debe dar 302 Location exacto, GET con query 400, POST token falso 200 not_found, métodos incorrectos 405.
3. Solo con pruebas positivas y autorización del entorno, considerar cambiar redirección de la Edge activa de piloto; no tocar producción, consentimiento, ranking ni WhatsApp.
4. Prueba de navegador con **dos enlaces auténticos** y revocación/aislamiento antes de marcar P0-B2r completado. No extraer ni imprimir tokens reales desde almacenamiento o mensajes; los hashes almacenados no permiten regenerar el token.
5. La Preview es temporal e inmutable; para operación estable deberá resolverse alias de proyecto/domino en proyecto único, con control de acceso por enlace y sin dependencia del build de cada PR.

## Estado
**Desarrollo** al crear el PR. El despliegue de la Edge activa y el E2E con tokens reales todavía no se acreditan; completar con evidencia de staging y CI.

## Ejecución REAL sobre Supabase, solo PILOTO — 04/11/2026

1. **Staging separado** `cotironda-piloto-seguimiento-mvp179-staging` v1 ACTIVE, `verify_jwt=false` por validación propia de token de 64 hex; paquete de 8 archivos de la Edge activa v10, cambiando solamente GET `Location`. Se comprobó de nuevo que **los 7 archivos dependientes son idénticos** y el fuente `index.ts` difiere solo en esa línea.
2. HTTP real sobre staging: GET a la función siguió la redirección y devolvió la nueva página de Cotironda (`200 text/html` después del seguimiento, con header `Location` correcto y secciones `resultsSection` y `coverageSection`); GET con query no autorizada `400`; POST con token ficticio de 64 ceros `200 {"state":"not_found"}`. GET activo antes del cambio aún apuntaba al dominio anterior.
3. **Función activa del PILOTO actualizada de v10 a v11**, paquete hash `88c366a694bbfcabff7a36a7987c7af21b62ba9f8d9ad92aa35d8f2aabab30dd`, sin cambiar rutas POST, el token/RPC, consentimiento, base, recuperador documental, Whapi ni finalistas. Se preservó el paquete anterior v10 para reversión.
4. **HTTP real posterior** a función activa: `Location` exacta a `https://cotironda-seguimiento-vista-piloto-8bfvf7vu1.vercel.app/seguimiento`; respuesta final HTML con secciones nuevas; GET con query `400`; POST token ficticio `200 not_found`. En la Preview se verificaron además CSP `script-src 'self'`, `no-store`, `no-referrer`, `nosniff` y `X-Frame-Options: DENY`.
5. **SQL post-deploy solo lectura**: dos enlaces vigentes, dos rondas `waiting`, 4 respuestas, 4 ofertas visibles, 4 registros económicos intactos, cero planes de finalistas, cero avisos y bandera de finalistas `false`. No hay nuevos contactos liberados, modificaciones en originales ni WhatsApp enviado.
6. **GitHub CI del PR #555:** seis workflows (incluido Deno) están en cola al registrar la evidencia; no atribuirles PASS hasta verificar su resultado. Los PR previos de esta pila tenían 2.058/2.058 unitarias y 5/5 CI PASS. El cambio del PR #555 contiene cuatro pruebas de contrato adicionales.

**Pendiente para P0-B2r:** validar dos enlaces PRIVADOS auténticos desde navegador de comprador, revocación, aislamiento por empresa y render de una ronda cerrada. No se intentó recuperar tokens en claro, ni se probó descarga de originales o ranking económico. No tocar producción `cotironda.com`.
