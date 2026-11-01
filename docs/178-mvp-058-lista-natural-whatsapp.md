# 178 — MVP-058: pedido multirrubro natural en un WhatsApp

**01/11/2026 · Issue #329 · exclusivamente código en desarrollo / CI.**

## Necesidad real
Un arquitecto no debería aprender a escribir una lista formal. En el piloto va a mandar, por ejemplo:

> 20 bolsas de cemento CPC 50 kg, 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata.

Antes, D073 pasaba el texto al lector D028, que esperaba **una línea por artículo** y una línea aparte para la zona. Esa frase completa no se podía interpretar con la certeza necesaria para invitar comercios.

## Corrección mínima
`src/domain/lista-whatsapp-natural-mvp058.ts` agrega **únicamente saltos de línea** ante comas, punto y coma o la conjunción *y* cuando les sigue una **cantidad + unidad conocida**, y ante una directiva explícita `Entrega:`, `Entrega en:` o `Plazo:`. El punto final después de la localidad no es parte del nombre de la ciudad. D073 aplica esto ANTES de extraer plazo y de invocar el parser ya validado D028.

La interpretación de productos, catálogos, IVA, localidad, plazo y ambigüedades sigue en D028/D053/D078/D081/D065/D071: el normalizador **no usa IA, no inventa unidades, no reduce cantidad de artículos, no cambia cifras decimales, no elimina líneas desconocidas ni decide proveedores**.

El mensaje anterior debería generar exactamente:
- `cemento_gris_obra`, 20 bolsas → corralones autorizados con catálogo.
- `hidrofugo`, 10 litros → corralones autorizados con catálogo.
- `pintura_latex`, 5 litros → pinturerías autorizadas con catálogo.
- Zona: `La Plata`; IVA: `no_especificado`; plazo: 5 días.

Si el mensaje no tiene localidad, se solicita **solamente ese dato**. Si contiene un producto desconocido, una cantidad sospechosa, una URL o condiciones contradictorias, se detiene la preparación para revisión; la regla no autoriza enviar artículos adivinados. Dos artículos de la misma familia con distintas especificaciones no deben aplastarse ni perderse silenciosamente.

## Contrato de pruebas
`tests/unit/mvp058-lista-whatsapp-natural.test.mjs` prueba D073 completo con adaptadores simulados sin red: mensaje de una sola línea, tres rubros, decimal 2,5, IVA explícito, plazo 3 días, zona faltante, artículo desconocido, familia repetida, cantidad ambigua, texto sospechoso y límites.

**Pendiente real:** SQL comercial D024+ y contactos/catálogos DEV aún no instalados; worker D082 no tiene aún proceso programado ni los puertos DB reales; Whapi no conectado; no se envían ni reciben WhatsApps reales con estos tests. También hace falta IA para documentos de verdad y textos fuera de las reglas verificadas. Ninguna configuración remota modificada. PR principal #220 continúa sin merge a main.

No se cambia el parser del portal, no se despliega en Vercel, no se instala SQL ni se activa Whapi.
