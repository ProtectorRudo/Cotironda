# MVP168 — Integración real del archivo fuente con auditoría económica privada

**Fecha:** 04/11/2026. Issues #529 y #535. **SOLO DESARROLLO: ninguna instalación, despliegue o WhatsApp autorizados en esta entrega.**

## Antes del cambio

- MVP163 descargaba el original privado desde \`cotironda-piloto-originals\`, verificaba SHA-256 y extraía unidades/presentaciones; persistía categorías en ledger privado. 
- MVP166/MVP167 eran módulos puros y todavía no consumían archivos del recuperador. 
- El comparador MVP162 requería evidencia fiscal, stock y condiciones completas y permanecía desconectado, correctamente, de las ofertas reales.

## Cambio de arquitectura implementado

1. **Lector común de bytes privados:** \`source-rows-mvp168.ts\` reutiliza los lectores PDF.js y Office ya existentes y la lectura TXT/CSV. Verifica tamaño y SHA-256 **antes** de analizar el contenido, y devuelve ubicación de texto por página/fila; nunca retorna contenidos por HTTP. \`source-facts.ts\` (MVP163) ahora usa esta ruta compartida, sin cambiar su RPC ni el payload almacenado.
2. **Servicio económico real** \`source-economics-mvp168.ts\`: una selección privada por tick, descarga el archivo del bucket con HMAC obtenido de SQL y misma SHA/versión v9; alimenta con los **bytes extraídos realmente** a los auditores MVP166 (descuentos) y MVP167 (IVA/flete/pago). El reporte no conserva texto literal, PII ni fuente original.
3. **Persistencia independiente**: \`supabase/piloto/mvp168_supplier_economic_source_ledger.sql\` define ledger privado append-only, RLS activado, permisos revocados, RPCs service_role para selección y registro, vigencia v9, invitación y consentimientos, bloqueo de revisiones superiores, carga 1:1 de todos los renglones fuente y validaciones estrictas por campos permitidos. El SQL es **propuesta no instalada**, requiere verificación separada en entorno de piloto.
4. **Enganche a cron existente**: \`logic.ts\` invoca la auditoría económica solo cuando no hay recuperación, clasificación, fuente v9 o facturación de hechos pendientes. \`index.ts\` habilita el callback solo si \`COTIRONDA_PILOT_ECONOMIC_FACTS_ENABLED === 'true'\` **y después de instalar las RPCs**. El valor predeterminado es OFF. No envía WhatsApp, no publica ofertas ni selecciona ganadores.
5. **Prueba reversible SQL** \`mvp168_smoke_rollback.sql\`: ejecutable manualmente SOLO después de instalar el esquema en un entorno autorizado. Comprueba grants, rechazo de campos extra/IVA falsa, ledger append-only y duplicados, ausencia de outbox de finalistas, y \`ROLLBACK\`. Sin despliegue no se puede decir que aprobó contra Supabase real.

## Contractos y limitaciones

La prueba documental v9 es la identidad de cotización; una revisión posterior invalida el uso de la antigua, incluso si tiene archivos intactos. El selector usa la transcripción inmutable de \`supplier_quote_lines_mvp101\` y no campos del navegador ni el JSON libre del LLM como fuente de autorización.

**La fuente debe ser efectivamente legible:**
- PDF con texto extraíble: página real, fila ordinal de extractor.
- XLSX/DOCX: fila visible y ordinal de extracción **VIRTUAL**; todavía **NO es hoja/celda exacta** y la presentación por múltiples hojas exige trazabilidad mejorada antes del ranking.
- Texto: líneas originales; imágenes escaneadas o formato no soportado quedan sin atestación, nunca se inventa OCR.
- Fuentes no legibles producen estado \`unreadable\`, sin ranking ni pérdida de original.

**Ninguna cotización pasa al ranking por este cambio.** El precio comercial tras descuento NO es necesariamente la base sin IVA. El módulo sigue informando \`rankingAllowed:false\`, \`netoSinIvaAcreditado:false\`, \`stockCorroborado:false\` y condiciones incompletas. No genera \`TerminosAuditados\` ni revela originales o contactos. Mantiene todas las ofertas visibles por el circuito preexistente.

## Criterios de aceptación y verificaciones

- Descargar una única fuente auténtica; SHA incorrecta **bloquea toda escritura**.
- Reutilizar extracción PDF/Excel/TXT sin cambios de formatos ni textos fuente.
- Persistir solamente campos aprobados, nunca nombres, documentos, enlaces, HMAC o notas comerciales en \`facts\`.
- Idempotencia SQL: un único registro por \`message_hmac\`; no cobrar dos lecturas ni enviar WhatsApp.
- Regression de MVP163; condiciones y descuentos sintéticos con cantidades reales de la ronda; PDF multipágina, archivo alterado, layout ilegible, moneda/IVA no declarados, función apagada.
- CI de Node y TS para el código; Deno Edge y **SQL smoke contra PG17** obligatorios antes de instalar/activar en piloto.

## Actualización comprobada el 04/11/2026 — instalación PILOTO, sin ejecución económica real

La primera prueba reversibile `BEGIN/ROLLBACK` aprobó, luego se instaló el esquema privado en `cotironda-piloto` mediante migración aditiva, con ACL/RLS comprobados y smoke reversible PASS. Se desplegó una Edge de staging v1 protegida por JWT y sin cron. La Edge documental habitual sigue v25. El ledger tiene 0 registros económicos; **ningún presupuesto real fue procesado por MVP168**. Ver [docs/287](287-mvp168-verificacion-real-piloto-sql-stage.md). El apartado histórico siguiente describe la situación de desarrollo antes de esta verificación.

## Instalación futura (NO ejecutada)

En entorno autorizado y con backup verificado: revisar SQL en PostgreSQL 17, correr propuesta de esquema en transacción segura, ejecutar smoke reversible, instalar RPCs y desplegar el paquete COMPLETO de la Edge Function (no reemplazar otros archivos de versión vigente). **Solo después** activar la variable de entorno; evaluar en modo solo lectura con la ronda original, sin activar ranking ni finalistas. Para producción se requiere nueva autorización explícita.

## Pendientes abiertos

- IVA unitario/base fiscal sin doble cálculo; flete realmente adicional o incluido en total, plazos, mínimos y disponibilidad; especificaciones técnicas respaldadas, no supuestas.
- XLSX: ubicaciones reales hoja/celda y pruebas de múltiples hojas; PDF imagen/escaneado.
- Empatar categorías de evidencia con \`TerminosAuditados\` y \`CorrelacionFuente\` sin crear falsos ganadores, y ejecutarlo exclusivamente al cierre de una nueva ronda. 
- Issue #532: eliminar límites de 10 ofertas / 25 materiales mediante diseño medido; no truncar silenciosamente.
- Descargas consentidas de todos los originales (#525), agradecimiento único (#526) e IA contextual/memoria (#527).

**Estado:** integración en código fuente de desarrollo, NO conectada a Supabase piloto hasta autorización de despliegue y verificación de SQL/Edge. No modifica la ronda de Ailín/Nahuel.
