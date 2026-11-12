# Cotironda V2-02 — Identificación segura de PDF/Excel por caption original

**Fecha:** 12/11/2026. **Estado:** DESARROLLO, no instalado en Supabase, Whapi, Vercel ni producción. PR apilado sobre [#816](https://github.com/ProtectorRudo/Cotironda/pull/816); jamás sobre #814.

## Problema real

El webhook ya descarga bytes íntegros por ID Whapi, verifica MIME/longitud/SHA y guarda el archivo en Storage privado. Puede vincular una respuesta al mensaje original citado, o al preámbulo ya asociado, pero un archivo sin cita y con dos rondas abiertas queda ambiguo. **No hay evidencia suficiente para atribuir un archivo silencioso a una obra específica**. La IA que lea materiales o precios no puede suplir esa prueba de origen.

## Primer incremento viable sin fricción

Si el PDF, planilla o imagen enviado tiene un **caption de Whapi con el código de pedido** (ej. `Cotironda pedido: AAAABBBB`), no hace falta que el proveedor cite un mensaje anterior:

1. El webhook verifica el origen y archiva el documento íntegro (como hasta ahora).
2. La capa V2 solo se ejecuta **después de** `finish_media_mvp095` con estado `stored`, con flag `COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED=true` (OFF por defecto).
3. La RPC privada `cotironda_piloto_v2_quoted_id_for_media_reference` recibe la **serialización textual idéntica** del manifiesto autenticado, no texto interpretado por IA ni un archivo reconstruido. Revalida el SHA del manifiesto en `whapi_inbox`, ID del media, MIME, checksum registrado, path privado, proveedor consentido, invitación anterior al envío, comprador autorizado y despacho Whapi realmente aceptado.
4. Rechaza cero o varias referencias, colisión de 8 caracteres, fecha incorrecta, proveedor ajeno, medio no almacenado, alteración de manifiesto y autorizar tarde. Solo si hay una coincidencia devuelve el ID saliente que el vinculador existente MVP225 vuelve a validar.
5. Si no existe ese caption, se mantienen sin cambios las vías de **mensaje citado, preámbulo seguro y correlación anterior**, o se deriva a revisión. No se envía una pregunta adicional al proveedor.

**No resuelve todavía:** un PDF/Excel completamente sin cita, sin caption, sin preámbulo ni identificador en el documento; en escenarios concurrentes no hay forma responsable de asociarlo con certeza. La futura alternativa es evidencia explícita verificable del binario mismo, sin reinterpretar facturas, por ejemplo referencia identificable en el encabezado con respaldo de bytes originales. Tampoco habilita por sí solo la descarga autenticada del comprador ni el análisis IA comercial.

## Componentes

- `supabase/piloto/v2_02_referencia_caption_adjunto_solo_lectura.sql`: lookup privado, solo SELECT, GRANT únicamente a `service_role`.
- `scripts/piloto/v2-02-whapi-overlay.mjs`: candidato desde baseline histórico inmutable, no modifica `index.ts`.
- `tests/unit/v2-02-referencia-caption-adjunto.test.mjs`: contrato, manifest y orden estricto `archivo guardado → referencia → MVP225`.
- `supabase/tests/ci/v2-02-media-caption-pg17.sql`: PostgreSQL17, PDF/XLSX de dos rondas, seguridad y ROLLBACK.
- Workflow dedicado V2-02: Node, Deno y PG17.

## Aceptación

- [ ] Workflow PG17 media caption, Node, Deno y pruebas generales verdes para último SHA.
- [ ] Evidencia de mismo contenido de webhook desplegado vs bundle candidato, sin pérdida de funciones existentes.
- [ ] Prueba sintética de PDF/XLSX con y sin caption, dos rondas abiertas, otra empresa/proveedor, SHA alterado, colisión, archivo no almacenado y autorizaciones tardías.
- [ ] Autorización independiente `Publicalo` para migración + Edge solo en PILOTO y activar flag después de validar; no tocar secretos.
- [ ] Prueba con original REAL y navegador comprador autenticado. **No ejecutada**.
- [ ] Continuar con identificación de documentos verdaderamente sin contexto y con portal original seguro.

**No usar este incremento para atribuir retrospectivamente archivos de fuente ambigua.** El caso histórico `ambiguous_round` permanece sin asignar.
