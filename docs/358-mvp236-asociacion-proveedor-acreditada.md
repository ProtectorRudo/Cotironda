# Etapa 2 — Asociación unívoca de mensajes y documentos: MVP236

## Hallazgo
El enlazador `cotironda_piloto_ia_link_supplier_mvp225` ya se abstiene si
hay más de una ronda posible. Sin embargo, al contar alternativas LEGACY
consideraba todas las invitaciones con `state='prepared'`, incluso si el
despacho WhatsApp no existía o no estaba aceptado. Esto podía producir
`ambiguous_round` cuando solo había una solicitud realmente enviada.

## Cambio mínimo
Para considerar una ronda LEGACY como alternativa, ahora debe existir
un registro propio en `whapi_outbox` con:
- mismo `request_id` y `supplier_key`,
- `state='api_accepted'`,
- `whapi_message_id` y `sent_at` válidos,
- envío ocurrido antes de recibirse la respuesta del proveedor.

Se utiliza `EXISTS`, no un `JOIN`, para no contar dos veces una misma
ronda con múltiples registros de transporte. Se sigue exigiendo que la
ronda esté preparada, vigente al recibirse la respuesta y pertenezca
al proveedor legítimo. `api_accepted` acredita aceptación por la API
Whapi, **no** entrega leída ni respuesta recibida.

Los trabajos IA Central siguen siendo candidatos solo con su propio
registro `ai_dispatch_jobs_mvp222.state='api_accepted'`. Ante dos o más
candidatos reales, la respuesta queda sin vincular automáticamente.
Una cita explícita del mensaje saliente de IA Central mantiene precedencia
y verifica proveedor e identificador de Whapi exactos.

## Seguridad
- El texto original se valida contra SHA256 del inbox ya autenticado.
- Mensaje duplicado no genera una segunda asociación.
- No se usan productos, precios ni una sugerencia de IA para decidir
  a quién pertenece un presupuesto.
- La función sigue siendo `SECURITY DEFINER` con `search_path=''`,
  ejecutable solo por `service_role` y no por usuarios públicos.
- Solo se prepara migración y CI; no se activa Whapi, no se modifica
  producción ni se envían mensajes a proveedores.

## Criterios de aceptación / pruebas
PG17 reversible valida: una ronda IA aceptada + legacy sin envío
(no ambiguo), legacy aceptado (ambigüedad real), cita exacta,
cita inventada, cita ajena, dos rondas IA, duplicados y ACL.

## Pendientes de la etapa 2
1. Asociación segura de archivos de proveedores en múltiples mensajes
   (mensaje + Excel/PDF/foto), sin inferir por parecido de artículos.
2. Registro privado de fuentes ambiguas para conciliación y una pregunta
   mínima al proveedor si realmente hace falta.
3. E2E de WhatsApp y documentos con dos rondas simultáneas para validar
   identidad, orden de llegada y reintentos.

Los puntos 1 y 2 tienen implementación posterior en MVP237–MVP239.
**MVP236 está instalado en `cotironda-piloto`** con PR #617 integrado,
Edge v54 y controles apagados (06/11/2026). El punto 3, la prueba real
con dos rondas simultáneas, continúa pendiente. Evidencia: decisión 362.
