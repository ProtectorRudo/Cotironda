# Decisión 456 — MVP326: estado real de revisión comercial y procedimiento sin reintentos

**Fecha:** 09/11/2026. **Autorización:** «Luz verde» para desarrollar y probar, **SIN publicar** en Supabase, Edge o Vercel, sin enviar WhatsApp ni llamar OpenAI. GitHub `ProtectorRudo/Cotironda` es fuente de verdad.

## Problema observado en el navegador real

Un arquitecto abrió desde su celular el enlace privado de seguimiento creado el **07/11/2026 a las 08:27 ART** para una ronda con cierre **11/11/2026 a las 08:27 ART**. La página mostró «1 presupuesto recibido», «1 archivo pendiente de verificación», «Esperando verificación». Consulta read-only de `cotironda-piloto` confirmó que **la única revisión económica nueva** terminó el 07/11 a las 13:45, con estado `review`, código `semantic_review_required` y `summary=NULL`. El enlace a la ronda, hash de fuente, consentimiento comercial y despacho previo fueron verificados; `ai_supplier_linked_replay_mvp295` marca `review/commercial_needs_review`.

El motivo exacto de la lectura histórica se **perdió** porque el procesador anterior grababa el código genérico. No se puede recuperar a partir de una conclusión ni «aprobar» los precios por intuición. MVP297 mejora causas **de nuevas lecturas**, no retroactivamente la del 07/11. Un reintento automático de esa misma fuente puede generar gasto adicional, duplicación de versiones o contradicciones.

## Criterios funcionales

1. Distinguir de forma verificable: **`requiere_revision` terminada**, **`en_proceso`** y **`verificado`** del *último original vinculado* de cada proveedor. Si llega una versión nueva, la anterior no reaparece ni se contabiliza como actual.
2. Mostrar al arquitecto una leyenda de avance sin números económicos ni referencias a proveedor; cuando terminó la lectura sin verificación, mostrar **«Respuesta procesada · revisión comercial necesaria»**, nunca «esperando verificación» como si la IA siguiera trabajando. No requerir reenvíos rutinarios.
3. No abrir presupuestos no verificados, no sumar importes, no alterar posiciones ni revelar identidades antes del cierre. Una respuesta interpretada por rubro sin precio verificado (MVP299) sigue separada de una cotización comparable.
4. Un token del comprador revocado, vencido, de otra empresa o cancelado jamás puede ver estos contadores. Si la proyección independiente falla, conservar el seguimiento anterior sin publicar un dato no acreditado.
5. No realizar ningún reintento de IA, WhatsApp, recálculo sin fuente, escritura al ledger, modificación de costo o cron desde la página.

## Cambio técnico

- `supabase/piloto/mvp326_estado_revision_comercial_comprador.sql`: **nueva** RPC `cotironda_piloto_ia_review_status_mvp326(text)` de solo lectura. Repite autorización privada de token, comprador, alta, consentimiento, revocación y estado de ronda del MVP227. Por `supplier_key` toma solo el último original cuya fuente coincida con inbox+SHA y con un despacho anterior `api_accepted`; para texto comprueba SHA del cuerpo, para documento existencia de original almacenado. La revisión finalizada `review` se cuenta como `requieren_revision`, `verified` con resumen estructurado como verificado; el resto está aún en proceso. **Solo devuelve cuatro contadores y flags de privacidad falsos**: ni razón interna ni identidad/contacto/hash, sin archivo original ni importes. ACL `service_role` exclusivamente.
- `src/domain/ia-central/estado-revision-comercial-mvp326.ts`: adaptador puro con **allowlist exacta**, tipos enteros y conteos acotados; rechaza si suma de estados ≠ vinculados o si los contadores superan lo ya autorizado por la vista MVP227.
- `supabase/functions/cotironda-piloto-seguimiento/index.ts`: llamada opcional a la nueva RPC solo después de la autorización del comprador por MVP227; la nueva propiedad `estado_revision_ia` no altera `can_open`, artículos, ranking ni `files_pending_review`.
- `piloto/seguimiento-web/api/estado.js`: segunda validación independiente antes de `if(!opened)`, preservando lectura de estado aun con 0 cotizaciones acreditadas. Cualquier campo inesperado descarta la proyección.
- `piloto/seguimiento-web/site.js`: mensajes diferenciados y tarjetas informativas sin precios. Evita duplicar respuestas ya informadas por MVP299 y evita limpiar indebidamente la vista al refrescar. La revocación vacía las tarjetas por la lógica existente.
- `supabase/tests/ci/mvp326-review-stage-buyer-pg17.sql`: PostgreSQL17 real aislado con fixtures y **ROLLBACK**: terminal review, procesamiento, oferta verificada, fuente alterada, suplente nuevo, token falso/revocado, ronda cancelada, acceso cruzado y ACL.
- `tests/unit/mvp326-revision-comercial.test.mjs`: proxy, adaptador, DOM, mensajes, rechazo de campos privados y regresiones.
- CI `cotironda-mvp326-review-status.yml`: Node22 + PostgreSQL17 sin credenciales ni consumo.

## Mecanismo seguro de resolución operativa (NO aprobación automática)

La pantalla no puede convertir `semantic_review_required` en precio verificado. La salida debe ser un **control interno de evidencia**, a cargo de Cotironda, sin exigir tareas al proveedor ni al comprador:

1. **Identificar sin reprocesar:** usar `request_id` y `message_hmac` **solo en el entorno interno**, comprobar fuente archivada, mismo SHA, remitente, despacho y ronda autorizados. No mandar identificadores al cliente, logs públicos ni navegador.
2. **Revisar la fuente original** con una comparación determinista: materiales, presentación, cantidad, unidades, precio unitario, importe por renglón, descuentos, total declarado, cargos extra, IVA, flete y pago. Documentar diferencias y decisiones con citas verificables; no asumir moneda, IVA, flete ni completar faltantes.
3. **Si falta evidencia:** mantener `review`, informar únicamente estado. No inventar importes ni adjudicar. No llamar a IA para repetir la doble lectura ya facturada, ni reenviar WhatsApps como maniobra automática.
4. **Si se obtiene nueva evidencia legítima:** tramitarla por una **nueva versión** con integridad verificable y una aprobación auditada; no sobrescribir ni reetiquetar como `verified` la revisión original cuyo motivo es desconocido. El flujo para publicar una **resolución manual respaldada por evidencia** aún **no está implementado** y requerirá una etapa posterior con controles y autorización. Este MVP solamente evita la espera falsa y deja el estado observable.

**No afirmar que el caso histórico quedó económicamente resuelto.** El registro de revisión se conserva. La experiencia del arquitecto mejora sin alterar la verdad comercial.

## Publicación posterior

- No ejecutar el SQL hasta recibir **«Publicalo»** y volver a verificar esquema, hashes, permisos, RLS y gates del piloto.
- Para actualizar Edge desde v26, inspeccionar los archivos reales antes de desplegar y asegurar el grafo completo de imports (MVP324). Mantener token interno, `verify_jwt=false` preexistente y no introducir envíos.
- Publicar solo `cotironda-seguimiento-vista-piloto`, en sus **dos alias** del mismo proyecto; no tocar la app principal ni Whapi.
- Validar HTTP y celular con enlace privado sin copiar el bearer; probar una ronda con `review` finalizada, otra `processing`, una `verified` y un enlace revocado. Este nuevo desarrollo no es prueba E2E hasta esa verificación.
