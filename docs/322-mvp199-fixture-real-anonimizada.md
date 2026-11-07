# MVP199 — prueba de regresión con los cuatro originales del piloto (datos anonimizados)

**Estado: pruebas en desarrollo. No despliegue, no cambios de datos ni WhatsApps.**

## Motivación

Los test sintéticos verdes no garantizaban que `seleccionarComercialmenteMvp196`
aceptara el JSON que entrega actualmente
`cotironda_piloto_private_round_inputs_mvp172`. En particular, ningún
original real del piloto contiene una columna estructurada de unidad, y
sus ofertas incorporan descuentos, cantidades comerciales y
presentaciones heterogéneas.

Se consultaron los dos expedientes del **piloto en solo lectura**.
La primera solicitud contiene tres materiales, dos cotizaciones y seis
renglones; la segunda, dos materiales, dos cotizaciones y cuatro renglones.
Ambas fuentes MVP172 declaran `private_inputs`; las cuatro
verificaciones originales son versión v9, vigentes, con estado
`source_checked`; sus diez renglones económicos tienen páginas,
filas y montos netos tras descuento conciliados.

## Artefactos

`tests/fixtures/mvp199-pilot-shape-anonymized.json` conserva el
**contrato estructural** de las dos solicitudes y sus cuatro ofertas
para reproducir errores: unidades NULL, cantidades, presentaciones de
bolsón, familias de materiales, estado fiscal no informado y cadenas
numéricas provenientes del PDF o Excel. Se conservan los importes
comerciales solo dentro del repositorio del proyecto para cotejar
determinísticamente el ledger; el fichero NO debe difundirse fuera
del acceso protegido del repositorio.

Antes de persistir la fixture, se descartaron `publicText`, texto
de chat, contactos, URL, teléfonos, identidades de vendedor,
`supplier_key`, `recipient_key` y cualquier token; todos los
UUID de las rondas, HMAC y SHA reales fueron sustituidos por
identificadores sintéticos consistentes. No permite encontrar ni
descargar los originales, escribir al proveedor o abrir un enlace.

`tests/unit/mvp199-piloto-documentos-v9-reales-sanitizados.test.mjs`
comprueba:
- Fuente privada de 2 rondas / 4 ofertas / 10 líneas, sin datos de
  contacto, con `unitLiteral=null` y referencias únicas.
- Diagnóstico offline MVP172 y selector finalista v9 MVP196 sobre
  **los mismos documentos y importes de estructura real**, no solo
  textos de ejemplo; selección sin habilitar ranking, adjudicación,
  contactos, descarga ni WhatsApps.
- Cada una de las diez líneas coincide en número, página y fila con
  el ledger; precio por unidad tras descuento × cantidad =
  importe original en centavos, con lectura de separadores argentinos.
- Rechazo de fuente cambiada, prueba v8, página o fila adulterada,
  sin generar plan privado ni filtraciones en la proyección pública.

## Criterios para cerrar

CI unitarios, Deno del worker, PG17 reversible, PostgREST, portal Next,
sitio; verificar merge en desarrollo y mantener `main` y PILOTO
intactos. Una fixture documental real anonimizada no sustituye a
una nueva ronda cerrada y consentida. La migración v196 sigue sin
instalarse, el envío y revelado de finalistas siguen OFF; ranking
homogéneo y todos los originales descargables continúan abiertos.
