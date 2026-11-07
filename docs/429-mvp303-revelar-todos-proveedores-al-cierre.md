# Decisión 429 — MVP303: todos los proveedores se identifican automáticamente al cierre

**Fecha:** 07/11/2026. **Estado:** desarrollo y pruebas, **NO PUBLICADO**. Autorización «Luz verde», sin desplegar ni reactivar Whapi.

## Regla de negocio corregida por el responsable de Cotironda
Se **elimina** la regla de «dos ganadores/finalistas revelados automáticamente». Tras vencer el plazo de la ronda y efectuarse su cierre automático, **el comprador puede ver la identidad de TODOS los proveedores invitados a ESA ronda**, no solamente dos elegidos por un algoritmo, sin exigir que el proveedor haya cotizado ni que su presupuesto sea económicamente comparable.

La identidad es independiente del ranking: no significa compra, adjudicación, cobertura suficiente, disponibilidad ni ganador. Se respeta la libertad del comprador para elegir después a uno, varios o ninguno. Durante el plazo, todos permanecen anónimos. Las empresas que no respondieron se muestran explícitamente como «sin respuesta»; un envío incierto se muestra como «envío no confirmado», jamás como si hubiera sido entregado.

**ALCANCE:** «Todos» significa *todos los proveedores realmente invitados a esa solicitud*, con consentimiento de participación vigente; jamás otros negocios de la plataforma. Una baja posterior de consentimiento impide revelar el nombre de esa empresa. Los nombres aparecen después de cerrada la ronda y comprobado el vencimiento, con enlace privado del comprador; el cierre corre por cron y puede reflejarse en el siguiente tick (actualmente cada cinco minutos).

## Privacidad y datos de contacto
Este cambio habilita **identificación comercial** `display_label` pero **NO habilita difusión de teléfonos ni información cifrada**. La base real actualmente tiene cero consentimientos específicos de divulgación de teléfonos en `contact_reveal_consents_mvp109`. Si se quisieran revelar datos de contacto de todos al cierre, se necesitan términos de alta claros que autoricen esa divulgación a cada proveedor, fuente cifrada válida y mecanismo que respete revocaciones. Hasta tener ese circuito aprobado, **ni teléfono ni WhatsApp se inventan o exponen**.

No se divulgan fuentes originales, HMAC, SHA, números, claves, contactos del comprador ni datos de otros compradores. El token de seguimiento conserva caducidad, revocación y ámbito de una sola solicitud.

## Arquitectura MVP303, sin publicar

- Migración `supabase/piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql`: función `public.cotironda_piloto_all_suppliers_closed_mvp303(text)`, restringida a `service_role`, que repite los controles de token, comprador, revisión confirmada, ronda IA, estado `closed`, límite ya vencido y consentimiento. Enumera invitaciones `prepared` con nombre, estado y, si hay una última respuesta económica `verified`, la etiqueta «Presupuesto N» compatible con MVP227. No impone límite de dos ni requiere plan de finalistas. No hay INSERT de mensajes, selección o adjudicación.
- Nueva **activación prospectiva OFF** `all_supplier_reveal_activation_mvp303`. Instalar migración no revela identidades de rondas históricas ni altera el piloto. Para una publicación posterior se requiere habilitar esta política bajo términos aprobados ANTES de originar rondas nuevas.
- Reducidor estricto `src/domain/ia-central/vista-proveedores-cierre-mvp303.ts`: protege el contrato de salida, máximo 100 proveedores, estado y alias de oferta, sin pasar campos privados o datos de contacto.
- Seguimiento Edge: llama RPC independiente de tener dos cotizaciones, solamente si la ronda cerró; si recibe evidencia válida, evita mostrar la antigua lista limitada de finalistas. Si no existe la migración o la fuente no es válida, no muestra identidades.
- Proxy Vercel `piloto/seguimiento-web/api/estado.js` vuelve a filtrar, solo POST con bearer, cerrado y campos permitidos. HTML/web móvil identifica todos los negocios con estado: presupuesto verificado, respuesta en revisión, sin respuesta, envío no confirmado. Se usan nodos `textContent` y no HTML arbitrario.
- La vista histórica de precios y comparador sigue siendo anónima durante la ronda, no cambia cálculo monetario, IVA, flete, diferencia de coberturas, correcciones, rankings ni precios.

## Criterios de aceptación
1. **Antes del cierre**: con token válido NO aparecen los nombres, incluso si la fecha ya es cercana; si `closed` pero `closes_at` futuro, tampoco.
2. Después de vencimiento **y cierre automático**: tres negocios invitados aparecen en prueba sintética, incluso el tercero sin envío confirmado, sin recortar a los dos que cotizaron. No se confunde nombre con ganador.
3. Dos ofertas IA `verified` mantienen sus alias correctos y no exponen nombres antes de vencer.
4. Invitado sin respuesta, mensaje en revisión y entrega incierta se diferencian; ausencia de teléfono/identificador de fuente.
5. Consentimiento revocado, token ajeno/revocado, ronda cancelada o de antes de activación **no permite revelar identidad**.
6. Prueba PostgreSQL 17 aislada inserta datos ficticios y termina con **ROLLBACK único**, más contrato Edge/Vercel/DOM y test global GitHub. No WhatsApp, no OpenAI, no gastos.
7. **SIN publicar** hasta que exista «Publicalo» específico y se apruebe activación prospectiva; no alterar historial.

## Decisiones reemplazadas
Las menciones históricas a «dos ganadores revelados» o «hasta dos finalistas elegidos automáticamente» en MVP108/110/196/301/302 fueron estrategias previas. Continúan existiendo en historial técnico, pero **no representan la nueva política de producto**. La optimización de cobertura de hasta dos proveedores puede mostrarse como orientación económica, nunca como selección exclusiva ni autorización de contactos. El criterio actual para revelar **identidad** es pertenencia consentida a la ronda y cierre temporal, no ganar un ranking ni tener dos presupuestos.

### Pendientes
Whapi sigue con prueba agotada: este desarrollo no valida el transporte real; se hará con canal habilitado. También falta confirmar el acuerdo de divulgación de contactos en el onboarding y hacer una ronda nueva en el piloto; no habilitar solo por publicar código.
