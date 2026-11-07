# Decisión 361 — Clarificación privada de rondas (MVP239, etapa 2)

## Problema
Un proveedor puede tener dos solicitudes enviadas válidamente por Whapi y
mandar un presupuesto sin citar ninguna. IA Central debe abstenerse de
adivinar su destinatario. No corresponde pedirle que vuelva a cotizar
ni que rellene un formulario.

## Flujo aprobado para desarrollo

1. MVP236/237 verifica y conserva el texto o archivo original SHA256 y
   registra el estado `ambiguous_round` o `context_blocked`. No se
   publica precio ni se elige el comprador.
2. Si el envío de aclaraciones está explícitamente autorizado por la
   variable `COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED=true`, el
   webhook pide al mismo proveedor, **una sola vez**, que responda
   **citando el mensaje ORIGINAL del pedido de Cotironda**; no nombra
   al comprador, fechas, importes ni posiciones comerciales.
3. El mensaje de aclaración queda reservado antes de Whapi. Límite de
   tres preguntas por proveedor/24 h. Un envío incierto es terminal: no
   reintenta ni duplica.
4. El proveedor puede responder «Es de este pedido». El mensaje debe
   citar el ID Whapi original de la invitación; se valida con los
   registros `api_accepted` del **mismo proveedor** y ronda abierta.
5. Solo si hay exactamente **un** presupuesto original irresuelto de
   ese proveedor en las últimas 24 horas, se vincula el origen
   conservado al ID de la solicitud. La invitación citada debe haber
   sido enviada **antes de recibirse ese presupuesto**, no solamente
   antes de la aclaración. No se asocia un texto «es este» como si fuera
   la nueva cotización; tampoco si no cita el pedido original.
6. Para adjuntos, se actualizan inbox, archivo original y ledger en
   **la misma transacción**. Para cotizaciones de texto, el flujo
   existente MVP227 puede leer el original AES-GCM y comprobar SHA.
   El archivo sigue sujeto a verificación documental de su contenido;
   la asociación no implica validar sus precios.
7. Ante cita falsa, remitente diferente, dos fuentes irresueltas,
   vencimiento o ambigüedad, se detiene sin inventar destinatario.

## Seguridad y operación

El envío de preguntas exige además
`integration_flags.whatsapp_inbound_enabled=true` y
`whatsapp_outbound_enabled=true`, incluso aunque `quote_link` permita
recibir cotizaciones de una ronda antigua con la prueba de compras
apagada. El texto de aclaración no hace ACK de presupuesto.

**Limitación explícita:** si la fuente textual original supera la ventana
de diez minutos del lector económico MVP227, su ronda puede quedar
correctamente asociada, pero el importe continúa en revisión para
recuperación documental posterior. La asociación nunca acredita precios
por sí misma.

Las tres RPC son `SECURITY DEFINER` con `search_path=''`, y solo
`service_role` puede ejecutarlas. El ledger y la tabla nueva tienen
RLS activado y accesos directos denegados. Las aclaraciones se almacenan
sin texto original, contactos ni importes; la fuente completa sigue
en su archivo cifrado, nunca en la respuesta de la RPC.

**La bandera de envío permanece OFF.** El control de nuevas rondas
continúa apagado; respuestas antiguas siguen reguladas por `quote_link`.
Nada habilita Whapi automáticamente con esta migración.

## Pruebas y pendientes

Pruebas PG17 en transacción reversible: remitente equivocado, ID citado
inexistente, dos presupuestos pendientes, resolución exacta por texto y
archivo, duplicados, plazo y permisos. Pruebas Node de intención humana,
no-confusión con cotización y mensaje sin datos personales. Regresión
Deno/Next y seguridad previa.

**Integración verificada 06/11/2026:** migraciones MVP236–MVP239
aplicadas al proyecto Supabase `cotironda-piloto`. Edge Whapi v54
`ACTIVE`, código exacto de GitHub, 25 controles CI del merge aprobados,
RPCs sin acceso público, tres gates privados en OFF, tres rondas
históricas conservadas y cero nuevas fuentes IA vinculadas.
La bandera `COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED` permanece
OFF por defecto: ningún envío de aclaración fue ejecutado.

**Pendiente para declarar completada la etapa 2:** prueba real E2E con
dos rondas de WhatsApp simultáneas y documentos de distintos proveedores
(decisión 362). No se realizaron mensajes reales en esta integración.
