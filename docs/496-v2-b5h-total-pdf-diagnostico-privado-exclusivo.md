# Acta 496 — B5h: diagnóstico del total de PDF

Fecha: 11/11/2026. Autorización: «Luz verde» para desarrollar y probar.
Destino eventual: exclusivamente Supabase cotironda-piloto (ilggkalaafhtiysyzlmg).
Estado: SOLO DESARROLLO. No instalar migración, no desplegar Edge, no activar V2.

## Evidencia privada del piloto

La prueba B5g real del 11/11 terminó con dos PDF históricos privados:
- Documento 1: 2/2 renglones y 2/2 descuentos identificados en columnas PDF.js.
- Documento 2: 5/5 renglones (3 materiales, 2 notas); 3 descuentos ubicados.
- Aritmética: matched_arithmetic_unverified en los 5 materiales.
- Los dos totales continúan source_total_unverified, aunque el candidato
  declare $469.042,52 y $392.850,58 respectivamente.
- Ambos estados B5g fueron review/b5g_source_review_required.
- No hubo nuevas ofertas públicas ni nuevos envíos desde esta prueba.
- Durante la ventana ingresó un PDF linked_quote adicional en B5d:
  el handler continuó de B5g vacío a B5d. B5h debe evitarlo.

No se conocen aún los motivos exactos por los que los PDF reales no
acreditaron sus totales: NO afirmar que sea un defecto de PDF.js ni que
los importes originales estén mal antes de ejecutar el diagnóstico nuevo.

## Diseño de B5h

1. diagnosticarTotalPdfB5h utiliza las filas PDF.js y el total declarado.
   Emite únicamente códigos cerrados: encabezado de columna, ausencia
   de total, monto sin etiqueta, etiquetas duplicadas, múltiples valores,
   valor diferente, IVA/flete mezclados, siguiente fila contaminada,
   valor en la misma fila o en la siguiente, y declaración inválida.
   No almacena texto comercial, importes, PII ni coordenadas.
2. diagnosticarPdfHistoricoB5h: un único archivo por tick, SHA y tamaño
   cotejados contra Storage privado, candidato B5d y cotejo B5 de
   renglones. No utiliza IA ni reabre B5g o B5d.
3. Nueva migración v2_b5h_private_total_diagnosis_versioned.sql:
   agrega v2_shadow_settings.b5h_only, apagado por defecto, y tabla
   v2_pdf_total_diagnostics_b5h con FK a B5g y nueva versión.
   Selecciona únicamente los dos históricos B5g en revisión;
   no selecciona linked_quote ni fuentes revocadas. RLS activo, sin
   lectura ni RPC para anon/authenticated, ejecución solo service_role.
4. En modo enabled=true y b5h_only=true, el handler B3 atiende
   exclusivamente B5h ANTES de B2, B5g, B5d o IA. Si la cola acaba,
   devuelve queue_empty: NUNCA pasa a otras fuentes. Si la RPC de modo
   falla, rechaza sin fallback. Cuando b5h_only=false preserva el
   recorrido preexistente; es necesario instalar SQL antes de Edge.
5. Siempre source_verified=false, can_publish=false, can_rank=false,
   can_reveal_contacts=false y outboundMessages=0. No modifica WhatsApp,
   cron, claves, vistas públicas, contactos ni rankings.

## Pruebas y aceptación

- Node: diagnóstico de totales normales, duplicados, diferencias,
  campos mixtos, importes sin etiqueta, error de lectura, SHA,
  idempotencia y exposición de datos.
- Edge: autenticación doble, selección exclusiva, cola vacía, errores
  de RPC, ruta normal y rechazo ante un falso canRank=true.
- Deno: check del handler completo y un PDF sintético con PDF.js.
- PostgreSQL 17: transacción ROLLBACK con RLS, roles, modo exclusivo,
  2 históricos, exclusión de linked_quote/revocados, no contaminación
  del JSON con datos personales, duplicados y ledgers intactos.
- Regresión completa de Node y manifiesto Whapi firmado intacto.
- Reauditoría real posterior con nueva autorización «Publicalo»;
  ventana acotada, dos ticks autenticados y ambos flags OFF al final.

## Decisión comercial

No se elige un total por inferencia, suma o parecido numérico.
Un código same_row_corresponds_private NO implica fuente completa
acreditada. Puede existir un segundo total o gastos no cubiertos.
Después del diagnóstico real, corregir únicamente la causa verificada.
El ranking, los importes públicos y las adjudicaciones siguen bloqueados.

No declarar B5h publicado ni piloto E2E terminado por ensayos.
