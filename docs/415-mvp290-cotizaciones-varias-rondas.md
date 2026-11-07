# Decisión 415 — MVP290: varios pedidos abiertos, un solo presupuesto original

**Estado:** desarrollo y pruebas, no instalado ni publicado. 07/11/2026. Issue [#681](https://github.com/ProtectorRudo/Cotironda/issues/681).

## Causa real (solo lectura)
Una respuesta PDF de proveedor consentido ingresó por Whapi, quedó guardada como original privado con SHA y dos líneas de borrador, pero `ai_supplier_unresolved_mvp237` anotó `ambiguous_round / candidate_count=2`. El contexto incluía una invitación legacy con `whapi_outbox.api_accepted` y la ronda nueva de IA Central con `ai_dispatch_jobs_mvp222.api_accepted`. El código nuevo no podía asumir que el PDF pertenecía a la ronda más reciente. La vista comprador mostró cero presupuestos porque **no existe una cotización asociada y verificada**; eso es correcto hasta terminar la validación.

## Regla de producto definitiva
No existe algoritmo que garantice la identidad de ronda para dos pedidos idénticos cuando el proveedor manda un archivo sin código, sin cita del WhatsApp original y sin ninguna identificación. Cotironda **nunca inventa** el vínculo. El circuito queda:
1. Priorizar referencia explícita del mensaje original (Whapi quoted ID) y enlace previamente acreditado (código/preambulo).
2. Cuando hay un único contexto **enviado, vigente e inequívoco**, conservar las rutas existentes. Cuando hay dos o más candidatos reales, NO elegir por fecha, monto, marca, volumen, similitud o IA.
3. Guardar el PDF original cifrado/privado con huella SHA; preparar UNA consulta al mismo proveedor con **las rondas que realmente le fueron enviadas** (legacy o IA Central), fecha/zona/material de ejemplo y un código criptográfico distinto por fuente + pedido. No publicar el archivo ni exponer teléfonos.
4. El proveedor contesta un texto `COTI <codigo>` sin reenviar el PDF. La misma función SQL verifica HMAC del evento, hash del texto exacto, identidad y consentimiento del proveedor, código de la consulta, autorización del comprador, invitación efectivamente enviada **antes** de la recepción del original, vigencia y ausencia de asociación previa. Actualiza inbox/archivo/liga/auditoría en UNA transacción.
5. El webhook reabre el documento **desde Storage privado** por ruta opaca, verifica sus bytes contra SHA, reutiliza la segunda lectura ya almacenada cuando existe, y exige doble lectura, aritmética exacta, contraste independiente del PDF y permisos de publicación. Una lectura ausente puede generar como máximo una corroboración adicional con cuota/lease persistente y gate de IA documental. Si no hay fuente íntegramente verificada, permanece en revisión, sin precio engañoso, ganador ni contacto.
6. Cualquier fallo, timeout de Whapi, código inválido, pedido cerrado, proveedor equivocado o duplicado queda en revisión o conciliación. La consulta y el reprocesado tienen registro único y no se reenvían automáticamente. No se crean rondas ni invitaciones nuevas.

## Efectos y privacidad
- Tablas privadas `ai_supplier_choice_prompts_mvp290`, `ai_supplier_choice_options_mvp290`, `ai_supplier_secondary_mvp290`, `ai_supplier_replay_mvp290` con RLS y sin permisos para `anon`/`authenticated`.
- RPCs `reserve/finish/resolve_supplier_choice`, `stage_supplier_secondary`, `reserve/finish_supplier_replay`, únicamente `service_role`, validación independiente de cada operación, `SECURITY DEFINER` + `search_path=''`.
- Flags nuevos `COTIRONDA_PILOT_SUPPLIER_CHOICES_MVP290_ENABLED` (**OFF** hasta habilitación autorizada) junto con `COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED` y autorizaciones activas de cotización. Document AI requiere su gate propio.
- Máximo 24 opciones por fuente y 8 consultas en 24 horas, un único envío por original. En casos mayores o si las referencias están vencidas, el proveedor deberá citar el mensaje original; no hay mapeo arbitrario.
- Rondas con productos idénticos siempre son separables por código, incluso cuando la IA no puede distinguirlas semánticamente.
- La comparabilidad técnica de 40×25 kg frente a 20×50 kg pertenece al **comparador**, NO es prueba de identidad de ronda.
- La elección del proveedor **no acredita precio, IVA, flete, pago, moneda ni cantidad**; requiere contraste independiente de original y cálculo determinista.

## Criterios de aceptación
- PostgreSQL 17 en `BEGIN/ROLLBACK` acumulativo: ronda legacy + IA Central superpuestas, 2 opciones únicas, mismo emisor/otro emisor, códigos ajenos, remitente revocado, consulta/selección doble, consistencia de cuatro vínculos, original SHA, RLS y cero trabajos/outbox extra.
- Node: composición de consulta, no marcadores repetidos, respuestas exactas, Whapi incierto sin retry; replay de PDF privado y SHA, dos lecturas, discrepancias y fallos; nunca publicación ni mensajes sin acreditación de fuente.
- Typecheck Deno/Next y pruebas generales. Después del merge, **no** instalar MVP290 ni activar WhatsApp sin un nuevo `Publicalo` acotado exclusivamente al piloto. Antes de declarar E2E real: prueba consentida de dos solicitudes concurrentes, PDF sin cita, código, vinculación y consulta en seguimiento; asimismo recuperación controlada de documentos históricos.

## Limitaciones honestas
La implementación no puede adivinar un PDF sin referencia ante pedidos indistinguibles: requiere una respuesta corta del proveedor. Los originales anteriores permanecen guardados; la emisión retroactiva de consultas requiere una acción auditada, **nunca un SQL que los enlace por heurística**. La publicación comercial solo ocurre con todas las verificaciones aplicables. Ninguna migración de MVP290 toca hasta hoy `cotironda-piloto`.
