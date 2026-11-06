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
   ese proveedor en los últimos diez minutos, se vincula el origen
   conservado al ID de la solicitud. No se asocia un texto «es este»
   como si fuera la nueva cotización.
6. Para adjuntos, se actualizan inbox, archivo original y ledger en
   **la misma transacción**. Para cotizaciones de texto, el flujo
   existente MVP227 puede leer el original AES-GCM y comprobar SHA.
   El archivo sigue sujeto a verificación documental de su contenido;
   la asociación no implica validar sus precios.
7. Ante cita falsa, remitente diferente, dos fuentes irresueltas,
   vencimiento o ambigüedad, se detiene sin inventar destinatario.

## Seguridad y operación

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

La integración de MVP236-239 a `cotironda-piloto` y la prueba E2E con
dos rondas de WhatsApp reales son hitos separados y se informan con
evidencia. No declaramos completada la etapa 2 sin verificar ambos.
