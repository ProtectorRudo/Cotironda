# MVP211 — Capacidad segura de seguimiento: 12 proveedores × 30 artículos

**Estado: solo desarrollo, SQL propuesto sin instalar.** Issues #529 (P0-H), #532.
No implica haber completado la escala general ni el circuito E2E.

## Auditoría de raíz (solo lectura en Supabase `cotironda-piloto`)

- `request_lines.line_no` permite 1–200; `supplier_quote_lines_mvp101.line_no`
  permite **solo 1–25 por ORIGINAL**. Tipos `smallint` adecuados para ese rango.
- Todas las rondas existentes estaban `prepared`, con máximos reales de 3
  renglones de pedido y 2 cotizaciones. No se alteró ninguna fila ni usuario.
- `cotironda_piloto_private_round_inputs_mvp172` devolvía
  `capacity_or_empty` para 26 artículos o 11 cotizaciones, aunque el
  comparador puro soporta hasta 100/200. El adaptador TS, fuentes económicas,
  combinador de cobertura y UI volvían a bloquear los mismos tamaños.
- La restricción de 25 renglones de **cada archivo original** no se modifica:
  requiere trabajo independiente en importación documental y reconciliación.
  El proyecto puede recibir un pedido de 30 ítems con ofertas parciales
  de 1–25 ítems cada una. Jamás se comparan totales de distintos alcances.

## Cambio integrado en DESARROLLO

1. Propuesta de migración `mvp211_private_round_inputs_capacity_12x30.sql`:
   reemplaza **el RPC privado ya existente**, no publica otro endpoint,
   sin modificar datos; permite 30 artículos del pedido y hasta 12
   documentos v9, manteniendo el tope **25 ítems por documento** y
   prueba integral de cada oferta, HMAC/SHA, expediente, consentimiento
   vigente y comprador autorizado. Si algún documento no pasa la
   evidencia, retorna `incomplete_evidence`; no omite solo ese documento.
2. Diagnóstico de presentaciones MVP170/MVP172, cobertura MVP175,
   referencias por ítem MVP186, parejas comercialmente posibles MVP189,
   parejas con importes MVP194 y condiciones MVP204 admiten 12×30.
3. Vercel whitelisting y browser verifican **todas** las 12 ofertas,
   30 referencias por artículo, 360 cruces y máximo 78 posibilidades
   individuales/pair y 66 pares no redundantes, sin exceder los
   límites combinatorios. Se incrementa la carga HTTP máxima
   de 64 KiB a **512 KiB** con respuesta de error cuando el
   conjunto entero excede el techo: **jamás trocear** sin informar.
4. Se mantienen la conservación de todas las ofertas individuales
   anónimas, el cambio/revocación de enlace y las restricciones de
   permisos. No se cambió el lenguaje de equivalencia ni se inventó
   stock, IVA, fletes o un precio comercial. La UI puede mostrar 12×30
   de cobertura e importes con los originales verificados.
5. Los cálculos **preliminares de canastas MVP185/MVP210** continúan
   deliberadamente con techo 10/25, por la búsqueda exacta de pares
   y el contrato actual. En tamaños mayores se omite **solo ese
   cálculo opcional**; no se muestra un ranking basado en un
   subconjunto. Ninguna interfaz afirma precio final.

## Comprobaciones

- Pruebas unitarias integradas con 30 artículos y 12 documentos v9
  derivados de casos PILOTO anonimizados; texto público invertido
  respecto del orden de HMAC, sin pérdidas de presupuesto y sin PII;
  validación de toda la cadena de cobertura/importes hasta proxy.
- Rechazo completo y explícito de la oferta 13 o el artículo 31,
  nunca un top N disimulado. Prueba de hash, revisión y texto ajeno.
- Smoke **PostgreSQL 17 aislado**: crea tablas sintéticas como el
  esquema real, instala el SQL solo dentro de `BEGIN`, ensaya 12×30,
  permiso exclusivo de service_role, 13/31, falta de evidencia y
  revocación, luego ejecuta `ROLLBACK`. Ningún acceso real a Whapi.
- Conservación del parser documental original, 25 líneas fuente por PDF
  o Excel, condición SQL `line_count BETWEEN 1 AND 25`.
- Los topes 12×30 son una **primera ampliación operativa**, no una
  solución definitiva de escala, paginación o costos.

## Pendientes para P0-H y el checklist maestro

- Escalar la extracción/documentación fuente a >25 renglones
  por documento sin omitir filas y sin relajar auditorías.
- Paginación segura de las vistas de 50–200 proveedores y 50–100
  artículos; presupuestos y PDFs por partes; cuotas y rendimiento
  medidos sobre rondas sintéticas, tiempo/MB/CPU y gastos API.
- Considerar pares exactos costosos con suspensión integral honesta,
  no ranking parcial arbitrario; preservar todas las ofertas.
- **No instalar** este SQL, deploy Vercel ni Edge en PILOTO sin
  autorización explícita `Publicalo en cotironda-piloto`.
- Probar allí una ronda NUEVA prospectiva con >10 proveedores/
  >25 ítems y seguimiento desde navegador antes de marcar P0-H
  terminado. `main` y producción nunca se modifican.
