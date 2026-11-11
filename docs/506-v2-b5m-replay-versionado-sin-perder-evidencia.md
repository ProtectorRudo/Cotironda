# Acta 506 — B5m: nueva corrida versionada sin sobrescribir el diagnóstico B5k

**Fecha:** 11/11/2026. **Alcance:** desarrollo y pruebas exclusivamente. **No publicar** SQL ni Edge sin «Publicalo».
**Rama:** `fix/v2-b5m-replay-versionado-20261111`; apilada sobre PR #777.
**Motivo:** el PDF 2 histórico ya tiene la clave única `(source_hmac, v2_b5k_20261111)`; instalar B5m sin un `processor_version` nuevo devolvería cola vacía y sería imposible contrastar la corrección con evidencia histórica.

## Decisión
- Reutilizar la tabla **privada, RLS ON**, `v2_pdf_currency_diagnostics_b5k` y las mismas RPC internas; **no** crear otro registro paralelo, nuevas funciones Edge ni llamadas a IA.
- Permitir la versión anterior `v2_b5k_20261111` y la nueva `v2_b5m_20261111` en la clave existente. La antigua jamás se actualiza en producción.
- La nueva RPC solo permite reivindicar una fuente idéntica (HMAC, SHA256, proveedor) con resultado B5k completo: `uniform_dollar_symbol_iso_unstated`, `fiscal_or_freight_ambiguous`, `line_assignment_ambiguous`, sin publicación, y con los mismos controles B5j, B5i, B5d, archivo, consentimiento y origen histórico.
- Una sola fuente por ventana, modo exclusivo `b5k_only`; cualquier error en modo/claim/finalización falla cerrado, sin enviar WhatsApp ni crear ofertas.
- El worker exige `processor_version=v2_b5m_20261111` **antes de descargar el original**. Reutiliza aritmética B5j y cobertura B5l mejoradas en PR #777; conserva los flags públicos siempre falsos.
- Este cambio habilita solamente una **nueva prueba privada y trazable**, no la publicación económica ni el circuito de punta a punta.

## Plan de instalación futura, solo bajo «Publicalo»
1. Comprobar seis workflows generales, CI nuevo Node, Deno, PG17 rollback y build. Si un control está pendiente/falló, detener.
2. Confirmar en `cotironda-piloto`: Edge sombra en v8, exactamente una evidencia B5k para el PDF bloqueado, ningún lease activo y cinco flags OFF. Documentar estado anterior sin datos personales.
3. Instalar `supabase/piloto/v2_b5m_private_pdf_replay_versioned.sql` **con los flags OFF**. Verificar RLS, roles sin acceso, versión histórica intacta, claim disabled. La función reescribe las RPC existentes, pero no modifica datos históricos.
4. Desplegar exclusivamente `cotironda-piloto-v2-shadow` desde la rama/commit auditados; mantener Vercel, Whapi, cron y plataforma pública sin cambios.
5. Habilitar por una sola llamada privada `enabled=true,b5k_only=true` (todos los otros modos false), procesar exactamente un PDF mediante el puente interno existente sin revelar tokens, y apagar los cinco flags inmediatamente, aun si hubo error.
6. Comparar **ambas versiones** por SHA y resultado económico/cobertura. Validar por separado subtotal, flete sin importe, IVA, moneda ISO, atribución PDF.js; la eventual corrección **NO** convierte subtotal en total final ni autoriza oferta/ranking/contactos.
7. Postflight: 5 flags OFF, 0 leases, B5k intacto, B5m nuevo si hubo corrida, 0 ofertas/WhatsApps nuevos, lecturas públicas sin cambios. Si la ejecución no es concluyente, informar motivo exacto y no reintentar a ciegas.

## Casos obligatorios de prueba
- B5k anterior no puede reclamarse como B5m; identidad SHA/proveedor inalterada.
- Si falta cualquiera de los dos bloqueos observados, claim = empty.
- Misma fuente solo una vez, no dos corridas B5m; protección por ventana y clave única.
- SHA errado, diagnóstico con PII, banderas publicables y doble finalización: rechazo.
- Roles anónimos y autenticados sin lectura ni ejecución de las RPC.
- PostgreSQL 17 en ROLLBACK y pruebas de lector PDF.js Deno con casos de condiciones en una misma fila.
- Fallos de Vercel por **límite de build** no se confunden con éxito de despliegue.

## Criterio comercial posterior
Primero prueba privada B5m, luego completar asociación real de respuesta WhatsApp a ronda, comparador determinista por rubro y equivalencia, vista anónima de condiciones/subtotales y cierre con revelación de todos los proveedores. La moneda `$` no certifica ARS; el flete mencionado sin importe no vale cero. Nunca equiparar una auditoría sintética o un diagnóstico privado con un presupuesto visible para el arquitecto.
