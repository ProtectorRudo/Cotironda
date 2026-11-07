# Decisión 371 — Publicador documental multirrubro sin filtrar proveedores (MVP248)

**Fecha:** 06/11/2026. **Etapa:** 3, comprensión comercial.

## Problema encontrado

El publicador privado MVP107, reforzado por MVP135, verificaba SHA
del original, doble lectura, sumatoria, líneas y anonimato. Pero su
lista estática de descripciones autorizadas aceptaba cemento, arena,
pallets, fletes y poco más. Una cotización legítima de pintura, cable
o sanitario no llegaba al comprador aunque su texto original hubiera
sido corroborado.

Esto se volvió un bloqueo funcional para el nuevo puente MVP245–247:
ese puente exige que el publicador existente ya haya acreditado una
proyección anónima íntegra. NO se debe suprimir la seguridad del
publicador para resolverlo.

## Solución

- Un guard privado y determinista de descripciones comerciales
  `descripcion_comercial_publicable_mvp248` amplía las familias a
  obra gruesa, pintura, electricidad, construcción en seco, sanitarios,
  ferretería, además de cargos y descuentos.
- La aceptación de vocabulario NO sustituye una lectura de origen.
  Se mantienen SHA, todos los renglones, dos lecturas coincidentes,
  equilibrio económico, consentimiento, empresa, ronda, antirepetición
  y anonimato del publicador MVP135.
- Nombres comerciales y expresiones con CUIT, teléfono, e-mail,
  WhatsApp, URL, direcciones y otras señales de identificación se
  rechazan; no se copian datos personales desde el documento original.
- Un artículo desconocido permanece privado para revisión. La IA
  interpreta lenguaje libre, pero la exposición automática anónima
  necesita límites auditables.
- La migración crea la función auxiliar en esquema privado, revoca
  accesos a `anon` y `authenticated`, y reemplaza el publicador
  conservando todas sus cláusulas originales salvo la lista estática.
- Afecta **solo al código del piloto**. No desplegar ni abrir gates
  sin preflight y autorización.

## Pruebas y límites

PG17 aislado con ROLLBACK: materiales de todos los rubros, sinonimias
frecuentes, extras, datos de contacto maliciosos, categoría desconocida,
revisión de que funciones siguen los controles de SHA/doble lectura/
totales/permisos y sin acceso SQL público.

Limites pendientes: esta lista nunca será un vocabulario exhaustivo;
el camino de revisión debe permitir nuevos productos sin inventar
equivalencia ni filtrar datos privados. Escaneos/fotografías sin
cotejo independiente siguen NO verificables automáticamente.

La etapa 3 permanecerá abierta hasta prueba real en piloto de
comprador + proveedores consentidos con documento original y
revisión contra la respuesta comercial.
