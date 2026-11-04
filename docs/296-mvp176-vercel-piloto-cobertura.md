# MVP176 — Cobertura comercial en la vista realmente desplegada del PILOTO

**04/11/2026 · Solo código, aún NO publicado. #529/P0-B2r.**

## Hallazgo y decisión
Se comprobó mediante HTTP real que el enlace que WhatsApp entrega al comprador pasa por `cotironda-piloto-seguimiento` en Supabase y redirige a un Vercel con `/seguimiento`. En la Preview actual del commit `5fbf2ec7`, `/seguimiento` entrega la página antigua (200) y `/seguimiento/app.js` devuelve 404. En cambio, `/site.js` y `/site.css` devuelven 200: la vista Vercel de piloto usa el directorio **`piloto/seguimiento-web`**.

Se probó el camino alternativo de servir HTML directamente desde una Edge: en staging respondió HTTP 200 con página nueva, pero el gateway Supabase **reescribió text/html a text/plain y CSP sandbox**. La plataforma no permite HTML directo sobre el dominio compartido (ver docs https://supabase.com/docs/guides/functions/http-methods). La variante fue descartada; PR #551 **cerrado, sin merge ni despliegue a la Edge activa**. No se intentará eludir una política de seguridad ni contratar un dominio de pago sin autorización.

## Solución adecuada y mínima
Se mantiene la arquitectura existente: Vercel sirve HTML/CSS/JS y el proxy `piloto/seguimiento-web/api/estado.js` hace un POST protegido a la Edge Supabase v10. Sin nueva plataforma, login ni formulario.

En la **carpeta que Vercel realmente utiliza** se agregan:
- Sección de cobertura agregada por ronda, con alternativas comerciales razonables, envases sin acreditar, pendientes de cotejo, diferencias y especificaciones inciertas. Nunca calcula precios, posiciones ni adjudica.
- Validación estricta de sumas y banderas (`ranking_allowed=false`, `price_comparable=false`, `contacts_revealed=false`). Proyección solo si el backend dice `can_open=true` y estado válido. Al mostrar ofertas sigue usando `textContent` y parser existente: no reescribe el presupuesto original.
- Limpieza de contador, fecha, archivos, tarjetas, finalistas y cobertura ante revocación, token inválido, estado inválido o pérdida de conexión.
- Conservación de la CSP fuerte `script-src 'self'`, assets locales `site.js/site.css`, proxy POST, `no-store` y privacidad. Backend, base, Whapi y `main` intactos.

## Criterios de aceptación
1. **2.033/2.033 pruebas unitarias PASS** (2.028 anteriores + 5 nuevas de navegador simulado), y controles CI de sitio, PostgREST, PostgreSQL 17 y Next.js PASS sobre el commit `d3b0e8db55ef4880282e329baac59c79929dda44`. Ningún test sustituye la Preview web real aún bloqueada.
2. Nueva Preview Vercel de `cotironda-seguimiento-vista-piloto` construida desde commit exacto y carpeta `piloto/seguimiento-web` cuando se libere la cuota 402.
3. Probar GET `/seguimiento` HTML correcto, GET `/site.js` con código nuevo, GET `/site.css`, POST `/api/estado` con token **ficticio**, ambos enlaces reales del comprador sin imprimirlos y revocación/aislamiento.
4. Solo después actualizar el destino de redirect GET del backend de piloto, si el alias no queda apuntando a la nueva Preview de manera confiable. Revalidar cero finalistas, cero outbox, recuperador v25 y 4 originales intactos.
5. Sin producción, `main`, mensajes reales, precio comparable, archivos originales descargables ni contactos liberados.

## Reversión
Frontend: volver al deployment Vercel anterior `dpl_Cmd7DeUprQ4RfBd8pFENgk27kMBF` si fuera preciso. Backend: Edge `cotironda-piloto-seguimiento` permanece v10 y no se edita en esta etapa. El nuevo código es aditivo a la vista; al no estar publicada, no exige ninguna reversión operativa.
