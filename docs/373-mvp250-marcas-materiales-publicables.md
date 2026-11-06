# Decisión 373 — marcas comerciales preceden material sin revelar el proveedor (MVP250)

Fecha: 06/11/2026. Etapa 3. No publicar ni activar WhatsApp.

## Hallazgo

El publicador documental privado MVP248 permite descripciones que
comienzan con el material, pero presupuestos reales también suelen
poner primero la marca: «Sinteplast Hidrofugo 5lts», «Alba Pintura»,
«FV Grifería», «Schneider Disyuntor». El motor IA Central no debe
descartar estas fuentes verificadas solo por el orden de las palabras.

Un permiso amplio de cualquier palabra delante de «pintura» o
«cemento» podría exponer por error el nombre de un proveedor o persona.
Por eso la regla no puede consistir en «aceptar dos palabras cualquiera».

## Solución

La función privada MVP248 se reemplaza por MVP250 únicamente para
permitir **una marca comercial acreditada y explícitamente conocida**
antes de un rubro previamente permitido, con o sin cantidad y envase.
Conserva los límites de longitud, filtro de contactos/identificaciones
y todos los chequeos del publicador MVP135/MVP248: SHA, doble lectura,
importes conciliados, consentimiento, identidad de empresa y ronda,
datos anónimos, cero cambios en precios ni ranking.

Marcas por ahora: Sinteplast, Avellaneda, Alba, Tersuave, Weber,
Sika, Knauf, Durlock, Klaukol, Loma Negra, Sherwin-Williams,
Petrilac, Tigre, FV, Ferrum, Peisa, Genrod, Schneider,
Cambre, Kalop, Prysmian, Acindar, Mapei, Barbieri e Isover.

**No es un catálogo exhaustivo.** Una marca no conocida permanece
almacenada y va a revisión privada, nunca se elimina ni atribuye a
otra ronda. Futura ampliación debe provenir de catálogos verificados
de productos, no aceptar nombres arbitrarios.

## Pruebas

PostgreSQL 17 aislado: propuestas de pintura, sanitario, electricidad,
cemento, impermeabilización y otros productos con marca precedente,
cantidad/envase opcional, y datos de teléfono, CUIT, empresas, correos,
descripciones desconocidas y PII. Asegurar que `anon` y
`authenticated` no ejecuten helper ni publicador.

Estado: desarrollo. Falta E2E real autorizado y validación de imágenes
de cotizaciones; no dar etapa 3 por terminada por este parche.
