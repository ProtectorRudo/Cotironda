# MVP182 — Activación del resumen económico en el seguimiento del PILOTO

**04/11/2026 · Rama de desarrollo sobre integración #558 · #528/#529/#535**

## Objetivo
Habilitar únicamente en el **seguimiento del comprador del piloto** la sección "Qué falta para comparar precios" que ya existe en MVP180, sin rankings económicos, sin descargas de originales, sin finalistas, sin cambios a Whapi y sin producción.

## Evidencia previa
- Consolidación #558 **MERGED en rama de desarrollo** `feat/mvp174-supplier-packaging-equivalence`, SHA `44a318826e7e30df31c147c2de3656c7d64d8f6d`. 39/39 archivos comparados con SHA de blob exacta respecto del PR #557, 2.087/2.087 unitarias y 6/6 CI PASS.
- Vercel proyecto público de **solo PILOTO** `cotironda-seguimiento-vista-piloto`, sin SSO; Preview READY `dpl_9merKhfKMDACowaQqtsLyPc3XRoJ` de commit `406d0108711ba25e02a37791b280e62eae80d88a` (URL `https://cotironda-seguimiento-vista-piloto-boqnfg2gk.vercel.app/seguimiento`). **Los cuatro archivos** `index.html`, `site.js`, `site.css`, `api/estado.js` son SHA Git EXACTAMENTE idénticos entre ese commit y la rama integrada.
- HTTP real sobre esa Preview: GET `/seguimiento` 200 con `economySection`; GET `/site.js` 200 con `showEconomy`; GET `/site.css` 200 con `.economy-panel`; GET `/api/estado` 405; POST con token ficticio de 64 ceros 200 `{"state":"not_found"}`. CSP `default-src 'none'; script-src 'self'; connect-src 'self'`; `Cache-Control: private, no-store`.
- `cotironda-piloto-seguimiento` v11 ACTIVE sigue enlazado a Preview anterior; `cotironda-piloto-seguimiento-economia-staging` v1 ACTIVE tiene 9 archivos, agrega solo reductor económico y RPC `service_role`. Su HTTP GET/POST ficticio ya pasó.
- La RPC `cotironda_piloto_buyer_economy_summary_mvp180(text)` está instalada **solo en PILOTO**. Dos enlaces legítimos vinculados a cuatro ofertas con fuentes SHA verificadas; 4 IVA no informados, 3 fletes sin informar, uno a convenir y cuatro disponibilidades sin acreditar. No devuelve nombres, precios ni hashes; `anon/authenticated` sin EXECUTE. Si la auditoría falla, se omite la sección.

## Cambio mínimo
Solo la URL GET 302 del archivo `supabase/functions/cotironda-piloto-seguimiento/index.ts` cambia de Preview anterior al Preview económico verificado. Las dos pruebas de contrato GET, privacidad y caché se actualizan a la URL exacta. Ningún cambio de lógica en POST, originales, finalistas, proveedor ni IA.

## Secuencia de activación
1. Verificar seis CI del PR y 2.087 o más unitarios.
2. Cotejar paquete de nueve archivos de la Edge económica de staging con la versión GitHub; aplicar **solo** cambio de URL GET sobre staging v1. Smoke GET 302 `Location`, contenido HTML económico, GET con query 400, POST token falso `not_found`.
3. Tras smoke y sin divergencias, reemplazar **solo** `cotironda-piloto-seguimiento` (no producción) por esos mismos nueve archivos, conservando hash/version anterior v11 para rollback. Rechequear GET + falso POST y en SQL dos enlaces/cuatro ofertas/0 finalistas/0 ACK nuevos.
4. **E2E que no se puede simular con hashes:** dos enlaces auténticos en navegador bajo control de sus propietarios, revocación y aislamiento; esto continúa abierto hasta prueba efectiva. Nunca recuperar ni imprimir tokens en claro desde Vault o chat.
5. La Preview es una URL inmutable pero no un dominio estable. Resolver alias/dominio estable solo después y con permiso específico. No cambiar `cotironda.com`, `main`, SSO ni facturación.

**Pendiente:** ranking de precios reales, consentimiento de originales con Auth de comprador, cierre/avisos, E2E WhatsApp. La sección muestra **ausencia de datos** y no convierte un IVA/flete/stock no declarado en cero.
