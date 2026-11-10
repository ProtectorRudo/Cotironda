# Decisión 370 — Preservación de adicionales sin columnas unitarias (MVP247)

Fecha: 06/11/2026. Etapa 3. Solo desarrollo, sin desplegar piloto.

## Incidente funcional

El puente documental MVP245 validaba que todos los renglones del presupuesto
tuvieran `quantity`, `unit`, `unit_price` y `line_total` no nulos.
Un flete fijo de $15.000, un descuento comercial sin cantidad o un pallet
retornable sin cargo eran rechazados aunque el lector documental hubiera
cotejado los bytes originales y su SHA.

La validación global conservadora es necesaria para precios por artículo,
pero NO debe imponer estructura de material a un cargo adicional.

## Regla corregida

- Todos los renglones corroborados se conservan en el texto de trabajo
  del lector comercial, incluso cuando cantidad, unidad, unitario o total
  no figuran en el original.
- Cada dato declarado se emite literalmente. Si el proveedor escribió
  solo «Flete hasta obra $15.000», no se inventa «1 unidad» ni
  «$15.000 por unidad».
- Si la propuesta dice explícitamente un precio unitario, exige que
  su cantidad y unidad también estén declaradas, o pasa a revisión.
- La revisión de fuente sigue siendo obligatoria, incluida la
  publicación anónima previa MVP107, dos lecturas iguales, importes
  conciliados, autorización por empresa y ronda, SHA del binario.
- El módulo MVP244 impide omitir importes adicionales. Las partidas
  extra NO reciben competitividad automática.
- Las fotografías, escaneos, documentación compleja o no verificada
  siguen guardadas para revisión. No se amplían privilegios.

## Pruebas

Nuevo corpus sobre flete con importe total sin unitario, descuento
con signo negativo y pallet sin cargo. Se rechaza unitario sin cantidad
o unidad. Suite documental MVP245 y resto de pruebas Deno/Node/PG17/Next.

Sin WhatsApp, sin cambios a SQL y sin despliegue. Etapa 3 pendiente de
auditar filtro de rubros del publicador heredado, soporte de foto
corroborada independientemente y E2E piloto real.
