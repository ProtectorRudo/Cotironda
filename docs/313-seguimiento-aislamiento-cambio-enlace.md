# Seguimiento del comprador — aislamiento al cambiar enlace privado

**Estado:** código y pruebas en rama de desarrollo; NO publicado. Issue #528 / checklist #529.

## Incidente prevenido
La página estática conservaba el bearer inicial en una constante aun cuando cambiaba el fragmento de URL. En una misma pestaña se podían observar datos anteriores, consultar el token viejo o dejar un resultado tardío visible tras pasar a otra ronda.

## Corrección
- El fragmento se toma de `window.location.hash` y se valida como token hexadecimal de 64 caracteres.
- Cada cambio real de fragmento invalida de inmediato las respuestas antiguas (revisión monotónica), limpia ofertas, cobertura, economía, fechas, importes, finalistas y totales.
- Solo un nuevo token válido inicia una consulta nueva; un enlace anterior revocado no se vuelve a intentar.
- La respuesta en vuelo se acepta únicamente si coincide con el token actual y la revisión solicitada. Un error o respuesta tardíos no modifica el estado de otro comprador.
- Los tokens viajan SOLO en el cuerpo del POST `/api/estado`, nunca en GET, `Location`, almacenamiento local, cookies o registros.
- El refresco periódico permanece disponible si una pestaña se abrió con enlace incompleto y luego recibió uno válido.

## Criterios de aceptación y prueba
1. A→B: la pantalla borra datos de A antes de mostrar cualquier dato de B.
2. A tardía→B actual: respuesta autorizada de A no reinstala el DOM privado.
3. A revocada→B: no reconsulta A; acepta B con nuevo token.
4. A→token inválido: borra inmediatamente y no llama al backend; cuando cambia a B válido, sí.
5. Una pestaña inicialmente inválida puede recuperarse sin recargar manualmente.
6. Cambiar a la misma URL no dispara consultas extras; respuesta de error de A no borra B.
7. Regresiones existentes de cobertura, precios, seguridad y portal siguen verdes.

Pruebas automáticas: `tests/unit/seguimiento-rotacion-token-privado.test.mjs`.
Este cambio NO sustituye la prueba visual con enlaces reales: **el E2E autenticado del comprador continúa pendiente**.

## Despliegue y reversión
No se modifica Supabase, Whapi, ranking, originales, consentimiento, `main`, cron ni producción. Tras CI, una publicación requerirá autorización explícita para `cotironda-piloto` y prueba HTTP y navegador. Para revertir, volver al JS del deployment previo verificado.
