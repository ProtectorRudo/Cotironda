# Decisión 379 — MVP255: etapa 4 en el seguimiento privado del comprador

Fecha: 06/11/2026. **Desarrollo solamente**. No publicar en PILOTO ni producción; sin mensajes WhatsApp.

## Objetivo

Extender el enlace ya existente del comprador de Cotironda con alternativas de cobertura **por rubro** sobre los presupuestos anónimos cuya fuente y cálculo SQL ya fueron acreditados por IA Central. Evitar otro frontend y un segundo mecanismo de autenticación.

## Arquitectura integrada

1. **SQL existente — MVP227:** `cotironda_piloto_ia_buyer_rubros_mvp227` verifica nuevamente token vigente, comprador consentido, revocación y ronda, y entrega exclusivamente los resúmenes de las **últimas versiones verificadas** de cada proveedor. Una cotización posterior todavía en revisión oculta la versión anterior, evitando mostrar precios obsoletos. No se añaden RLS, roles ni migraciones.
2. **Edge de seguimiento:** solo se consulta este RPC cuando `can_open=true` y la ronda está abierta o cerrada. `vistaCotizacionesRubrosMvp227` valida la proyección inicial. `resumirAlternativasRubrosMvp255` conserva los artículos con importe comprobado por origen, pero **no reconstruye presupuestos de fuente falsa** para hacer pasar la validación económica MVP225. Comparte con MVP254 la rutina determinista que propone parejas complementarias por cobertura.
3. **Proxy Vercel:** `piloto/seguimiento-web/api/estado.js` comprueba de nuevo las tres banderas negativas y listas cerradas de rubros, ítems y etiquetas `Presupuesto N`; rechaza cantidades incoherentes y sobres de datos alterados. Solo copia una lista blanca, nunca SHA, HMAC, originales, identificadores reales o contactos. Si `can_open=false`, enlace revocado, cancelado o upstream falla: no devuelve opciones.
4. **Pantalla del comprador:** la web existente `piloto/seguimiento-web/index.html` y `site.js` agrega un panel `Alternativas por rubro · IA Central`, con obra gruesa, pintura, electricidad y demás rubros. Diferencia los artículos con importe cotejado, los pendientes de precio, combinaciones de **uno o dos presupuestos**, respuestas existentes sin precio y condiciones declaradas iguales o diferentes. Usa `textContent`, nunca HTML de proveedores.

## Criterios económicos estrictos

- **Cobertura mínima acreditada** = conjunto de artículos del pedido con precio directo verificado en la fuente original. Un proveedor que respondió más artículos pero sin un precio homologable sigue visible como presupuesto; **no se inventa su identidad ni su cobertura a nivel de ítem**.
- Cada opción forma parejas solo si su unión mejora la cobertura de cada uno por separado. Se ordena por cantidad de ítems con referencia, **jamás por suma de ofertas parciales**.
- Dos presupuestos con moneda/IVA/flete/pago iguales pueden tener **condiciones declaradas coincidentes**, pero NO significa que los importes sean económicamente equivalentes o que compartan condiciones reales conocidas. `totalGlobalComparable=false` siempre.
- La opción completa significa "todos los artículos del rubro tienen un precio directo acreditado en al menos una de estas ofertas"; **no** implica stock, entrega, disponibilidad, marca equivalente, IVA calculado ni precio final.
- Mostrar hasta **12 combinaciones por rubro**, informando explícitamente "N de M combinaciones" cuando el conjunto es mayor. Los originales presupuestos existentes siguen visibles.
- **No** adjudicación, ranking global, revelación de contactos ni mensajes automáticos.

## Seguridad y condiciones de aceptación

- La nueva sección usa un único token ya existente, sin nuevos URLs públicos ni credenciales. El token no pasa por query string, localStorage ni logs.
- Revocación posterior, cambio de hash, denegación del proxy o falta de red eliminan la sección y todas las ofertas como antes.
- Se valida todo el sobre de datos **antes de pintar cualquier alternativa**, con listas cerradas de rubros, ofertas y artículos.
- Probar contrato, API proxy y DOM con ofertas parciales, dos proveedores complementarios, tipos de moneda diferentes, precios faltantes, fuente adulterada, PII agregada, revocación y falla de red.
- CI general: unitarios, Deno typecheck de Edge, Next.js, PostgREST y PostgreSQL 17. Merge exclusivamente a `feat/mvp174-supplier-packaging-equivalence` tras los controles.

## Lo que falta para terminar la etapa 4

- **Publicación explícitamente autorizada del PILOTO** con la versión y entorno verificados; esta rama no despliega.
- Ejecución de un flujo completo real Edge → Vercel proxy → DOM con una ronda real que tenga al menos **tres rubros**, **dos proveedores con coberturas complementarias** y una oferta parcial.
- Inspección de montos originales, IVA, flete, presentación, equivalencias de marca, disponibilidad y modalidad de pago; ninguna afirmación de precio ganador hasta acreditar comparabilidad.
- Más adelante, si el producto necesita todas las combinaciones en rondas grandes, agregar paginación autenticada con servidor sin soltar el límite de respuesta; no entregar 300 opciones sin control de tamaño.
- Las etapas 1–3 siguen sujetas a sus verificaciones operativas, incluyendo inferencias de IA reales y WhatsApp; el PR de la vista **no las cierra**.

No marcar "publicado" ni "etapa 4 terminada" a partir de estas pruebas sintéticas.
