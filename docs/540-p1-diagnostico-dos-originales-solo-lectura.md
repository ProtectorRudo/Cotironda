# Acta 540 — P1/P2: por qué el comprador no ve dos originales de proveedores

**Fecha:** 12/11/2026. **Instrucción:** «Avanza y registra en nuestro checklist y plan maestro». **Solo desarrollo + lectura real**, sin migraciones, actualizaciones de datos, mensajes, despliegues, rondas nuevas ni revelación de originales.

## Decisión: no agregar otro subsistema de consentimiento

Los PR #804–#812 cubren consentimiento prospectivo y panel MFA **en código**, pero permanecen abiertos y no desplegados. El piloto comercial sigue bloqueado en **P1/P2**, antes de siquiera necesitar el permiso para descargar. Reutilizamos el contador documental MVP354/MVP355 y el sistema `whapi_inbox`/archivo privado/correlación `ai_supplier_links_mvp225`; no creamos un nuevo archivador ni un ranking económico.

## Nuevo preflight ejecutable en base PILOTO, exclusivamente SELECT

Archivo: [`supabase/tests/preflight/p1-documentos-dos-proveedores-solo-lectura.sql`](../supabase/tests/preflight/p1-documentos-dos-proveedores-solo-lectura.sql). **Verificado ejecutándolo realmente por Supabase SQL SELECT** sobre proyecto `ilggkalaafhtiysyzlmg` el 12/11/2026.

- Solo evalúa cuando hay **exactamente UNA ronda `prepared` no vencida**. Si hay 0 o más de 1, estado `sin_ronda_unica_no_evaluar` y no vincula nada.
- Revisa invitaciones, despacho Whapi confirmado, archivos `stored` con SHA/ruta/tamaño/MIME y ventana de recepción del inbox firmada, **dos vínculos a la MISMA ronda** (inbox y archivo), y además vínculo formal MVP225 con `quoted_whapi_id`, `single_active_round` o `prior_supplier_preamble`. Rechaza `ai_supplier_unresolved_mvp237` y rondas con despacho solapado, como MVP355.
- Es un diagnóstico **interno** y no una API del comprador; devuelve únicamente conteos y booleanos agregados, nunca IDs de ronda, proveedores, HMAC, texto, precios, contactos, Storage paths ni datos comerciales.
- Separa claramente `proveedores_con_candidato_temporal` de `recibidos_verificados`. Una coincidencia de proveedor + ventana horaria con un documento histórico **NO** significa que su archivo pertenezca a la ronda.
- Comprueba si la función de recepción MVP354 está instalada, sin ejecutarla ni activarla.
- Se añadieron pruebas unitarias para garantizar SELECT único, rechazo de rondas múltiples, correlación fuerte, aislamiento de salida y ausencia de SQL de modificación; este script SQL además **se ejecutó con éxito contra la BD PILOTO real**.

## Resultado verificable del PILOTO (12/11/2026)

| Control (agregado, sin identidades) | Resultado |
|---|---:|
| Rondas `prepared` vigentes | **1** |
| Proveedores invitados / despachos `api_accepted` | **2 / 2** |
| Proveedores con documento candidato por ventana temporal | **1** |
| Proveedores con archivo original `stored` e integridad básica de fuente | **1** |
| Proveedores cuyo inbox **y** archivo están asociados a esa ronda | **0** |
| Proveedores con vínculo formal fuerte MVP225 de la misma ronda | **0** |
| Proveedores con documento acreditado sin ambigüedad | **0** |
| Proveedores con candidato temporal **no atribuible** | **1** |
| Proveedores sin candidato documental en la ventana | **1** |
| Conflictos de asociación acreditada | **0** |
| Función de recepción MVP354 instalada en PILOTO | **No** |

El inbox contiene mensajes históricos con documentos, pero no equivale a recibir presupuesto de esta nueva ronda. **No modificar a mano `request_id`, `ai_supplier_links_mvp225` ni `supplier_media_quotes` para convertir el candidato temporal en respuesta válida.** Primero revisar evidencia del mensaje citado, preámbulo acreditado y fuente real, o esperar la respuesta genuina al pedido actual. No exigir al proveedor editar nada por problemas internos de Cotironda. No crear ronda nueva solapada.

## Próximo bloqueo y criterio exacto para cerrar P1/P2

- [x] Estructura y origen de datos actuales auditados contra GitHub + esquema SELECT Supabase.
- [x] SQL de diagnóstico agregado creado y ejecutado en base real en modo solo lectura.
- [x] Se detectó **por qué 2 envíos no generan 2 recibidos**; ninguna correlación temporal se promocionó a proof.
- [ ] Validar un **mensaje documental nuevo y auténtico** de cada proveedor para esta misma ronda con hash, archivo `stored`, origen de inbox y vínculo MVP225 comprobado; si uno no llega, reconocerlo como pendiente sin datos fabricados. No basta con contar WhatsApps históricos.
- [ ] Instalar MVP354/MVP355 en el PILOTO únicamente bajo `Publicalo` explícito; validar tracking comprador mediante token legítimo y salida anonimizada, separado del cálculo económico.
- [ ] Completar autorización de originales (P0 con condiciones legales y MFA), comprador Auth Phone/OTP, cierre y descarga auditada (P3–P5).
- [ ] No suponer P1/P2 completadas por CI o por este diagnóstico: **0/2 recibidos verificados ahora**.

**Handoff inmediato:** la siguiente intervención debe centrarse en probar la asociación `inbox → media_archive → ai_supplier_links_mvp225` con una respuesta genuina de los dos proveedores sin cambiar vínculos antiguos. Si la ronda vence, no convertirla retroactivamente en prueba exitosa; auditar cierre y preparar otra ronda **solo cuando ya no haya una `prepared` vigente** y exista autorización de publicación de una prueba.

Fuentes: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [PR #798](https://github.com/ProtectorRudo/Cotironda/pull/798).
