# ADR 353 — Cotizaciones unitarias sin total declarado

Fecha: 05/11/2026. Código de desarrollo para el piloto IA Central.

## Caso real habitual

El proveedor puede enviar «20 bolsas de CPC a $8.000 c/u», sin
escribir «total $160.000». El lector MVP225 rechazaba la línea por
falta de `totalLineaLiteral`, pese a que la cantidad y el unitario
sí constan en la fuente y se pueden multiplicar sin inferencia IA.

## Regla corregida

1. La IA reconoce materiales/importe y conserva el texto original.
   Si el proveedor NO escribió un total, `totalLineaLiteral=null`.
   No pedir confirmaciones rutinarias ni pedirle a la IA calcular.
2. `calificador-cotizaciones-mvp225.ts` verifica que el precio
   unitario literal figure en la cita del proveedor. Con total
   presente, comprueba la multiplicación exacta en centavos y rechaza
   toda diferencia; nunca reemplaza el total declarado.
3. Si falta el total, se admite un subtotal exclusivamente cuando
   consta la cantidad normalizada como token numérico independiente
   **fuera del valor monetario**, y existe indicación contextual de
   precio por unidad (c/u, unitario, cada, por bolsa, por m3, x $...).
   No confundir 20 bolsas con el precio $20.000 ni con 20kg de una
   descripción, ni asumir un total si solo aparece "$8.000".
4. El cálculo usa `BigInt` y centavos exactos, sin redondeos que
   inventen fracciones de centavo. Si el texto contiene «total»
   ambiguo o un segundo importe y la IA no lo declaró, se bloquea.
5. Se preservan condiciones IVA/flete/pago/moneda. Si la moneda no
   está suficientemente acreditada, la oferta sigue en revisión y
   NO compite económicamente con precios de moneda conocida. Nunca
   comparar totales de coberturas parciales ni adjudicar solos.

## Pruebas de aceptación

Tests unitarios: precio $8.000 x 20 = $160.000; cantidad ausente;
importe monetario confundido con cantidad; precio aislado sin señal
unitaria; total de $170.000 omitido por IA; fracción de centavo.
Verificar build Next.js, Deno, PostgreSQL y acceso privado antes de
desplegar. No enviar WhatsApp real durante despliegue.

## Alcance

No cambia los modelos, el enrutamiento de proveedores, secretos,
plazos, permisos, enlaces, datos históricos ni el circuito de archivos.
No elimina otros pendientes del checklist #529. El primer E2E con
comprador y proveedores reales sigue siendo necesario.
