# Acta 480 — MVP344: evidencia real de precios y revisión desde original

**Fecha:** 10/11/2026. **Estado:** SOLO DESARROLLO. Sin SQL real, despliegues, WhatsApps ni llamadas de OpenAI.
**Depende de:** PR #752 (MVP343 mínimo), PR #742 (MVP336), MVP103/MVP106/MVP248.
**Prioridad:** primero circuito funcional con datos fieles; medición detallada de IA después.

## Hallazgo en piloto (Supabase, solo lectura)

El último PDF archivado de Ailín sigue con dos rondas candidatas y tres líneas sin unidad.

La primera evaluación usó erróneamente la versión antigua del publicador MVP107 del repositorio. Supabase real ya tiene el helper privado descripcion_comercial_publicable_mvp248. Al verificarlo directamente sobre las descripciones del archivo, el resultado fue **3/3 artículos admitidos**, incluidos **2/2 BIG BAG**. Se **cerró sin integrar el PR #753**; su migración innecesaria fue detenida por la validación de definición SQL. No es un bloqueo de catálogo ni hay que desactivar las reglas de privacidad.

Una segunda comprobación determinista con el parser monetario PostgreSQL MVP103 de la propuesta archivada, sin divulgar importes, encontró:

- 3 cantidades, 3 precios unitarios y 3 importes con formato interpretable.
- El total declarado coincide con la **suma de los 3 importes**.
- Sin embargo, en **los 3 renglones** no coincide cantidad × precio unitario con importe.
- La nota menciona pago al contado y flete, pero **no se detectó referencia explícita** a precios de lista ni a descuentos. Por tanto no se puede explicar automáticamente esa diferencia como descuento, IVA o doble columna.
- El borrador de IA no es una oferta comprobada. Se requiere el **PDF original archivado**, segundo análisis y verificación independiente de campos.

Así, MVP336 puede asociar la ronda, pero MVP103 impediría publicar por incoherencias de precios. La asociación no equivale a una oferta.

## Cambio seguro de este PR

En supplier-archive-replay-mvp292.ts, que ya recupera el original privado y corrobora el SHA, si el dictamen de MVP103 registra line_multiplication_mismatch, el resultado interno queda con el código **unit_price_source_recheck_required**.

- El código no divulga importes, no envía mensajes y no invoca IA adicional.
- Conserva el requisito de que auditoría de importes devuelva balanced **y** que la evidencia independiente del archivo indique source_text_covered antes de publicar.
- No divide importes por cantidad para fingir precio unitario, no sobreescribe el borrador ni presupone descuentos, IVA o flete.
- El motivo se guarda en el ledger interno del replay cuando se confirma su finalización; permite diagnosticar el bloqueo sin hacer trabajar al proveedor.
- Las cotizaciones con aritmética equilibrada y fuente comprobada conservan el flujo de publicación original.

Pruebas Node sintéticas: 3 líneas contradictorias → revisión sin publicación; otra fuente no comprobada → revisión; positivo con controles aprobados → publicación. Sin datos reales ni dinero gastado.

## Siguiente etapa imprescindible para el E2E

Después de vincular el PDF con una ronda por MVP336, el trabajador deberá contrastar **qué cifra es unitario, cuál es total y qué condiciones comerciales acompañan a cada valor** en el archivo binario original. Si el borrador estaba mal interpretado, guardar una **versión nueva auditada**, sin alterar el original, volver a cotejar con MVP103/MVP106 y recién entonces proyectarla en MVP248.

Si realmente hay precios de lista y de contado, mostrarlos diferenciados y no inventar un unitario efectivo. Hasta entonces el documento debe quedar privado.

No se tocó Supabase, Vercel ni Whapi. El despliegue del circuito mínimo aún requiere Publicalo, control de versiones y comprobación posterior en vivo.
