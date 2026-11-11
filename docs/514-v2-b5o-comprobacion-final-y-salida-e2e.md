# Acta 514 — Comprobación final privada B5o y salida hacia el piloto comercial

**Fecha:** 11/11/2026. **Orden:** «Luz verde» (desarrollo y pruebas, **no** instalar SQL, desplegar Edge, ejecutar PDF real ni enviar WhatsApps).
**PR:** [#786](https://github.com/ProtectorRudo/Cotironda/pull/786), apilado sobre [#785](https://github.com/ProtectorRudo/Cotironda/pull/785).
**Fuentes previas:** [Acta 512 (B5n real)](https://github.com/ProtectorRudo/Cotironda/pull/784), [Acta 513 (B5o doble referencia nota/condición)](docs/513-v2-b5o-doble-referencia-nota-condicion.md).

## Contexto y decisión

En el PDF real, la lectura B5n quedó con **3 de 5 condiciones** de fuente corroboradas, con `first_unresolved_condition_ordinal=4` y `condition_failure_kind=source_part_mixed`. La evidencia estructural de B5d mostró que los ordinales 4 y 5 aparecen como **notas comerciales sin precio** y, a la vez, como condiciones declaradas del mismo PDF. En B5o se corrigió el doble conteo con una regla conservadora: solo se comparte la evidencia cuando coinciden **completamente**, pertenecen a un único fragmento PDF.js, no hay precio, material, IVA extra ni otra condición oculta.

La base original registra los diagnósticos B5k, B5m y B5n como **evidencias históricas inmutables**. No se deben reabrir ni reescribir. Una lectura de la nueva lógica debe poder probarse usando el cron B4 existente y dejar registro reproducible, sin volver a construir toda la ingestión.

### Único control versionado B5o

Se preparó `supabase/piloto/v2_b5o_final_private_pdf_check.sql`. **NO está instalado.**

- **No crea tablas, cron, secretos, endpoints ni mensajes.** Conserva los controles existentes de `service_role`, RLS, origen HMAC, SHA256, archivo PDF original, proveedor autorizado y requisitos de resguardo/consentimiento ya verificados.
- Extiende el `processor_version` del ledger privado exclusivamente con `v2_b5o_20261111`. Las versiones B5k/B5m/B5n se mantienen intactas.
- Exige como predecesor **exactamente el diagnóstico B5n** de ese proveedor y SHA, con `economic_total_balances=true`, `coverage_conditions=5`, `coverage_conditions_matched=3`, `first_unresolved_condition_ordinal=4`, `condition_failure_kind=source_part_mixed` y `can_publish=false`. No puede tomar otro proveedor o documento.
- Reutiliza la **ventana B4 de ocho minutos**, existente cron de cinco minutos, y pone `enabled=false,b5k_only=false` en la **misma transacción de claim**. Si el claim no encuentra el PDF, también los apaga; si nunca entra, la ventana vence y no permite procesar, pero el apagado físico posterior debe confirmarse.
- El worker de fuente `src/domain/presupuestos-v2/worker-moneda-original-b5k.ts` requiere `v2_b5o_20261111` antes de descargar bytes de Storage. La finalización no convierte la lectura en publicación y mantiene `source_verified=false`, `full_document_covered=false`, `can_publish=false`, `can_rank=false` y `can_reveal_contacts=false`.
- Una única fila B5o puede registrarse en el ledger privado; si ya existe, B4 deja de disparar y la segunda lectura no tiene fuente elegible.

## Pruebas de desarrollo

- **Node:** worker rechaza una respuesta de claim B5n y verifica reglas SQL B5o (antecedente, rechazo de SHA/versión indebidos, permisos, ventana y autoapagado).
- **Deno PDF.js:** pruebas sintéticas de B5o para condiciones/nota redundante y IVA/importe mezclado; la evidencia numérica nunca habilita publicación.
- **PostgreSQL 17 ROLLBACK:** fixture original B5g–B5n en transacción más nuevo B5o. Prueba preflight con flags apagados, bloqueo de predecesor B5n incorrecto, una única fuente reclamable, rechazo de SHA incorrecto, cierre tras apagar flags, B5k/B5m/B5n intactos, ausencia de acceso público y rearmado duplicado rechazado.
- **Regresión y build Next.js:** verificar flujos anteriores, auth y seguimiento, sin modificar aplicaciones públicas.

No declarar controles exitosos sin resultados GitHub sobre commit final.

## Puente al piloto comercial E2E: no seguir creando diagnósticos indefinidos

La **etapa posterior** a comprobar el PDF real NO debe ser otra ronda de diagnósticos aislados. El código B6 de comparación económica entre fuentes corroboradas **ya existe**, incluyendo artículo equivalente por unidad/cantidad/IVA/moneda/pago/entrega, coberturas parciales separadas y combinación de hasta dos proveedores. Por seguridad, las pruebas B5d/B5e/B5n no habilitan B6 solamente porque su subtotal parezca correcto.

Los siguientes hitos, con evidencia REAL y criterios de aceptación:
1. **Fuente comercial:** PDF y Excel originales asociados por SHA/ronda/proveedor y condiciones sin omisiones, con subtotales de materiales determinados y flete/IVA/cargos extra como explícitos o inciertos, sin inventar valor final.
2. **Comparación B6:** dos presupuestos aptos, misma zona/rubro y artículo equivalente; diferencias de cobertura se presentan por separado; nunca comparar el total menor de un pedido incompleto con el total de uno completo.
3. **Arquitecto:** vista previa anónima por rubro con cantidad de renglones y **solo importes corroborados claramente como subtotales**; al cierre mostrar proveedores según reglas y originales descargables, manteniendo la identidad del comprador protegida.
4. **WhatsApp real:** un pedido del arquitecto, proveedores Ailín y Nahuel recibiendo por WhatsApp, ambos respondiendo PDF/Excel o texto, IA interpretando y publicando únicamente la información que realmente pudo verificar; sin confirmación adicional ni mensajes duplicados.
5. **Seguridad:** 5 flags OFF fuera de mantenimiento, RLS efectiva, cero duplicados, costos/identidades protegidos y control de consentimientos.

El nuevo B5o tiene que ser **un criterio de decisión**, no una excusa para seguir acumulando versiones sin conseguir la experiencia comercial. El flete sin importe no es gratis; el símbolo `$` sin contexto no determina moneda ISO; IVA no declarado no puede convertirse en IVA incluido. No revelar contactos antes del cierre.

## Si más adelante llega «Publicalo»

- Verificar CI del último commit y preflight Supabase piloto (Edge v10, cinco flags OFF, B5k/B5m/B5n=1 cada uno, B5o=0, 0 leases, sin WhatsApps pendientes).
- Instalar **solo** migración B5o con flags OFF y desplegar en Edge V2 el módulo B5l revisado y el worker con versión nueva, manteniendo los demás archivos intactos.
- Armar una única ventana privada de 8 minutos sin extraer secretos, supervisar el cron B4 existente, cerrar flags aunque no haya trabajo, comparar los cuatro diagnósticos y comprobar 0 cambios en ofertas/mensajes.
- Informar si hay cobertura 5/5 visible o un nuevo bloqueo. **Ninguno de los dos por sí solo certifica el monto final ni habilita ranking público**.
- No realizar merge ni desplegar producción a partir de «Luz verde» ni «Publicalo» de piloto.
