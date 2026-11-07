# MVP194 — Comparación de cobertura con importes reales, al cierre

**Alcance:** desarrollo exclusivamente. Integra **Edge de seguimiento existente
→ proxy privado Vercel → pantalla real del comprador**; no crea plataforma,
no instala SQL, no cambia WhatsApp, no despliega, no revela nombres, no elige
proveedores ni suma materiales como si fueran un costo final.

## Problema y solución

En `cotironda-piloto`, al momento del control de solo lectura (04/11/2026):
2 enlaces buyer válidos, 2 rondas visibles `waiting`, 4 documentos y 5
artículos. Los 10 renglones carecen de unidad explicitada; 4 contienen prueba
fuente de BIG BAG y 6 no. El precio por artículo existente (MVP186) ya
verifica versión 9, SHA/ledger, revisión vigente, texto público exacto,
cantidad, descuentos y tratamiento IVA, y oculta importes inseguros.

Antes, esa evidencia estaba dispersa entre varias tarjetas: el comprador
no sabía cuáles ofertas tenían un importe original asociable para cada
material ni si dos presupuestos parciales reunían importes para su lista
completa.

## Implementación sin inventar ranking

1. `src/domain/cobertura-importes-cierre-mvp194.ts` toma **exclusivamente**
   el objeto ya autorizado de MVP186 y el estado token-validado del
   comprador (revisión original previa: MVP172/175/180/186).
2. Recorre la lista completa de artículos y los identificadores de cada
   presupuesto, sin fiarse del orden de las fuentes HMAC ni del orden de
   respuestas. Cuenta únicamente `importeCotizado` no nulo y respaldado
   por IVA comercial homologable, cantidad fuente y estado de alternativa.
3. Produce un conteo por TODAS las ofertas, incluidas las parciales. Para
   parejas (máximo dos proveedores), exige una canasta completa con importe
   fuente por artículo y aportes exclusivos de AMBOS. No se excluyen otras
   ofertas ni se recomienda una compra automáticamente.
4. Solo se crea en ronda `closed`, `can_open=true`, conteos de fuente
   exactamente concordantes y flags de prohibición de rankings/contactos.
5. `supabase/functions/cotironda-piloto-seguimiento/index.ts` reutiliza
   **la misma proyección MVP186** después de pasar las autorizaciones
   de token/RPC; no vuelve a leer PDF/Excel ni mezcla nuevas consultas.
6. `piloto/seguimiento-web/api/estado.js` recalcula de manera
   independiente los conteos y las parejas a partir de MVP186 ya
   blanqueado; si hay cualquier diferencia, omite SOLO este bloque.
   No reenvía fuente privada, HMAC, rutas, teléfonos, importes de opción
   ni documentos.
7. `piloto/seguimiento-web/index.html` y `site.js` muestran la
   cobertura de importes del original por proveedor anónimo y las
   parejas que completarían la lista **sin sumar dinero**. El navegador
   revalida el bloque y lo borra de inmediato en revocación, cambio de
   token o pérdida de conexión; usa solo `textContent`.

## Criterios de aceptación

- Fuentes faltantes, duplicados, IVA incluido, nueva versión o cambio
  de sesión de buyer no deben habilitar una comparación artificial.
- Una pareja con ambos ofreciendo el mismo artículo pero sin importe
  de otro artículo no es completa; una oferta completa sola tampoco
  obliga a mostrar una segunda empresa.
- Un origen económico no soportado se explica como importe faltante.
- Los originales permanecen intactos y disponibles solo por el
  circuito Auth prospectivo y consentido independiente.
- `ranking_allowed=false`, `price_comparable=false`,
  `automatic_award=false`, `finalists_selected=false`,
  `tax_calculated=false`, `freight_calculated=false`,
  `stock_confirmed=false`, `contacts_revealed=false`.
- Resultado nunca sale antes del cierre. No modifica fotos, mensaje,
  proveedor ni transcripción comercial.

## Límites

**Este avance NO cierra el ranking económico de verdad.** La cobertura
de importes no permite sumarlos sin moneda y unidad normalizadas,
IVA/fletes/mínimos/pago acreditados. Si el piloto sigue `waiting`,
el bloque estará oculto aun después de desplegarlo. No hay E2E
auténtico con ronda cerrada, notificaciones ni originales descargados.

Rollback: revertir cambios en Edge/proxy/UI en una publicación piloto
posteriormente autorizada, sin alterar DB. Ninguna bandera de
finalistas, WhatsApp, descargas ni otros módulos cambia.

Referencia: issues #524, #535, #529.
