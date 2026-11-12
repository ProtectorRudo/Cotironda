# COTIRONDA V2 — CONTRATO CANÓNICO DEL PRODUCTO

**Decisión del propietario: 12/11/2026. Estado: APROBADA COMO DIRECCIÓN DE PRODUCTO, NO IMPLEMENTADA NI DESPLEGADA.**

> **PRECEDENCIA OBLIGATORIA:** este documento reemplaza las decisiones funcionales anteriores en lo que contradigan Cotironda V2. Para ejecutar trabajo leer primero: **este contrato → [Plan maestro V2](PILOTO-100-PLAN-MAESTRO.md) → [Estado/relevo V2](PILOTO-100-ESTADO.md) → [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794)**. README y AGENTS deben apuntar aquí. La documentación en `docs/historico/`, PR anteriores y memorias de chat son evidencia histórica, **no instrucciones activas**. Toda duda se registra como decisión explícita, no se resuelve recuperando una regla vieja.

## 1. Qué vendemos (una oración)

**Cotironda solicita cotizaciones de materiales de obra a comercios pertinentes, conserva y presenta sus presupuestos originales identificados, analiza cada respuesta para orientar al comprador y, al cerrar, entrega una comparación general con recomendaciones razonadas.**

No somos una bolsa de archivos, un ranking anónimo, un intermediario que oculta negocios ni un sistema que elige ganadores automáticamente. El valor es **conseguir respuestas, organizar los originales y ayudar a decidir sin trabajo manual**.

**Clientes:** arquitectos, estudios, constructoras y compradores de materiales especificables. **Proveedores:** comercios por rubro con catálogo y área de entrega. Proveedores gratis/sin comisiones. Abono de compradores estimado **$10.000 ARS/mes** y prueba gratuita **a validar**; medir costos reales antes de prometer ilimitados.

## 2. Circuito único de extremo a extremo

1. **Pedido del comprador:** texto, foto, PDF, Excel, Word, o documento recibido por canal habilitado (WhatsApp prioritario, web cuando aplique). IA detecta materiales, cantidades, unidades, variantes, rubros y zona de entrega. Si falta zona/localidad, hacer **una única pregunta imprescindible**; no exigir al comprador editar o reconfirmar el pedido en el flujo normal. La distribución requiere una fuente de pedido confiable y una identidad autorizada; esa validación de seguridad sucede sin fricción innecesaria.
2. **Distribución selectiva:** cada negocio recibe por WhatsApp **solo los ítems de su catálogo/rubro y zona**, en un pedido claro con referencia única. La referencia sirve para asociar archivos y respuestas, no para poner a trabajar al proveedor. No asumir que estar invitado significa tener stock ni que una marca alternativa equivale siempre.
3. **Respuesta libre del negocio:** texto, foto, PDF, Excel, Word, audio compatible o combinaciones, sin formularios, ediciones ni confirmaciones rutinarias. Conservar el **archivo original exacto** (bytes, tipo, SHA, origen, fecha y proveedor) o el texto exacto del mensaje. Una respuesta puede incluir artículos adicionales, pallets, condiciones o correcciones: **no mutilar el original**.
4. **Vinculación segura de la respuesta al pedido:** webhook autenticado y deduplicado; relacionar por remitente, mensaje citado/ID, referencia explícita, contexto suficientemente inequívoco y evidencia histórica compatible. **Nunca** asignar por similitud de fecha si hay ambigüedad. Si una respuesta no puede asociarse, queda en **revisión interna** y NO aparece como presupuesto de la ronda; no pedir automáticamente al comercio reenviar.
5. **Publicación inmediata para el comprador:** tras la asociación correcta y permisos de acceso, **aparece el nombre del negocio que respondió**, el **original descargable** y su **análisis individual**. Si el análisis todavía se está generando, indicar `Análisis en preparación`; **nunca bloquear el original por un parser que falló**. Si no es posible mostrar el original de forma legal/segura, no anunciarlo como disponible.
6. **Durante la ronda:** el comprador ve **EXCLUSIVAMENTE negocios que ya respondieron**. No mostrar nombres de invitados que no respondieron, listas de pendientes, cantidad total de negocios consultados, contador de faltantes ni supuestos ganadores. Si no hay respuestas: `Todavía no recibimos cotizaciones`. No usar ranking global mientras la ronda esté abierta. Los comercios no ven documentos de competidores.
7. **Cierre:** duración predeterminada **DOS DÍAS HÁBILES**, **NO 48 horas de trabajo**; fecha y hora exactas de cierre visibles desde el inicio y calculadas con zona `America/Argentina/Buenos_Aires`, fines de semana y calendario de feriados aplicable. **Regla operativa inicial propuesta para prueba:** cierre 18:00 del segundo día hábil siguiente al envío. Validar el calendario (incluidos feriados locales) antes de activar cron; plazo configurable. No inventar entregas ni respuestas tardías: separarlas y registrar cierre.
8. **Informe final:** al vencer, comparar **todas las cotizaciones válidamente asociadas recibidas en plazo** por rubro, cobertura, artículo equivalente, presentación, cantidades, IVA, flete, descuentos, disponibilidad, entrega y pago. Generar conclusiones **justificadas**, alternativas de compra con uno o varios proveedores cuando corresponde, riesgos, ahorros SOLO comprobables y recomendaciones. Si solo hay una oferta, informar que no existe comparación; si ninguna, cerrar sin inventar un ganador. Originales siguen accesibles según permisos.

## 3. Presentación y análisis: reglas firmes

**Durante la ronda, una tarjeta por comercio que respondió:** nombre visible, fecha, rubro, archivo(s) original(es) verificables, total SOLO si lo declara inequívocamente el proveedor (señalando moneda/base), y breve **análisis comercial útil**. Ni lista de invitados ni estado de quienes todavía no enviaron.

**Análisis individual:** objetivo editorial **70–110 palabras orientativas**, flexible si el caso merece más/menos. Máximo cuatro focos prácticos, sin párrafos interminables: (a) cobertura respecto del pedido y faltantes/sobrantes; (b) diferencias materiales de unidades, cantidades, marcas o formatos; (c) condiciones comerciales/logísticas relevantes explícitas y ausencias; (d) **conclusión accionable** sobre qué debería revisar el comprador. Priorizar riesgos/costos que cambian decisiones; no llenar con generalidades. Ejemplo de valor: comparar bolsas de 25 vs. 50 kg a unidad equivalente si la equivalencia técnica se confirma. **No decir «es el mejor» en una ficha individual** antes de comparar el resto.

**Informe final:** más profundo que las fichas; por rubro y con referencias a evidencia. Matemática de precios/diferencias **determinista y verificable**, IA interpreta y explica. Nunca comparar totales de canastas distintas ni inventar descuentos, IVA o flete. Si una condición no se especifica, expresar **`No informado`**; no inferir `incluido`, `gratis` o `sin IVA` sin respaldo explícito. Las ofertas parciales se marcan como parciales. No premiar indebidamente la menor suma que excluye materiales.

**Comercio identificado, acceso privado:** Cotironda **no oculta identidades de proveedores que respondieron** al comprador destinatario, ni espera al cierre para enseñar sus presupuestos. Esto NO significa publicar archivos a Internet, revelar la identidad privada del comprador a cualquiera ni compartir datos de otros proveedores. Los negocios deben conocer y aceptar, durante el alta/invitación, que sus cotizaciones originales y sus datos comerciales contenidos en ellas se mostrarán al **comprador destinatario**. Revisar términos, privacidad y tratamiento de información sensible (CUIT/CBU/contactos) antes de activar esa revelación. Sin solicitar autorización separada por cada presupuesto. No asumir consentimiento que no existe.

## 4. Cambios explícitos frente a decisiones anteriores

| Antes / documento viejo | V2 vigente | Consecuencia |
|---|---|---|
| Ofertas anónimas y contactos solo de ganadores | **Negocio identificado en cuanto su respuesta queda verificada** | Eliminar anonimización de la UX del comprador; asegurar términos y privacidad. |
| Ranking en tiempo real, ganadores automáticos, dos vencedores | **Fichas descriptivas durante ronda + recomendación general al cierre** | No usar ranking/ganadores para bloquear originales o publicar una oferta. |
| Cierre a cinco días por defecto / 3–7 configurables | **Dos días hábiles por defecto** | Recalcular plazos; calendario y hora explícita. |
| Mostrar proveedores pendientes o número de invitados | **Mostrar solo respuestas recibidas** | Nada en el portal puede delatar invitados sin respuesta. |
| IA debe extraer precios perfectamente antes de publicar | **Original verificado primero; análisis no bloqueante** | Separar ingesta, interpretación y recomendaciones. |
| Comprador y proveedor deben confirmar cada paso | **Flujo normal automático, sin confirmaciones rutinarias** | Conservar comprobaciones de identidad/permisos y revisión solo por excepción. |
| Bloquear a un proveedor mientras esté en cualquier ronda (PR #814) | **Debe poder cotizar MUCHAS rondas simultáneamente** | **NO DESPLEGAR #814 tal como está**. Resolver asociación por referencia, mensaje citado y evidencia, no prohibiendo concurrencia. |
| Portal de originales solo después del cierre | **Original de cada negocio visible tras recibirse y asociarse**, autorizado | Rediseñar política y UX de forma prospectiva. |
| PDF reconstruido por IA | **Conservar original exacto** | IA solo comenta, no falsifica ni reemplaza documentos. |

**El resto de controles técnicos de seguridad se mantiene:** secreto nunca en repositorio, WhatsApp con consentimiento, RLS/aislamiento por empresa, deduplicación de webhooks, Storage privado, hashes, auditoría, costos medidos, rollback, trazabilidad y autorizaciones de despliegue.

## 5. No cometer estos errores

- **No continuar PR #804–#812, #814 o la cadena de consentimientos/anonimato por inercia.** Son trabajo **en pausa y sujeto a triage V2**; conservar código/pruebas útiles, no fusionar ni desplegar hasta decidir si sirven a este flujo. El consentimiento de alta y la protección del comprador siguen siendo necesarios, pero no un sistema que frene cada descarga.
- **No duplicar la bandeja, el Storage, WhatsApp, la correlación ni un panel de revisión si ya existe.** Primero auditoría de componentes reales.
- **No crear una segunda ronda sobre la ronda histórica activa** solo para probar. Las rondas legítimas V2 **sí** podrán solaparse por proveedor, **cuando** se implemente identificación confiable.
- **No interpretar un HTTP 200, CI verde o consulta SQL como E2E funcionando**. Separar `CÓDIGO`, `TEST SINTÉTICO`, `INSTALADO EN PILOTO` y `E2E REAL`.
- **No priorizar optimización de tokens de IA, portal avanzado, rankings ni suscripciones** antes de que el circuito normal funcione completo.
- **No exigir al proveedor cambiar su proceso habitual** para corregir deficiencias nuestras.

## 6. Prueba única para decir «piloto funciona»

Con **un comprador real habilitado** y **dos proveedores reales que aceptaron recibir consultas**, sin revelar sus datos en GitHub:

- [ ] Comprador envía pedido real en formato admisible; Cotironda detecta materiales y zona y lo distribuye **una vez** por rubro y catálogo.
- [ ] Ambos proveedores responden en **formatos distintos** por WhatsApp, sin portal ni confirmaciones extra.
- [ ] Se verifican dos fuentes originales, con SHA, mensaje/remitente y **ronda correcta**; no hay confusión con documentos de otras rondas.
- [ ] El portal muestra **solo los comercios que respondieron**, con nombres reales, originales autorizados descargables y análisis individual útil; los invitados sin respuesta son invisibles.
- [ ] Se valida el cierre de **dos días hábiles** y un informe final comprensible por rubro con comparaciones correctas y recomendaciones sustentadas; sin IVA/flete inventados.
- [ ] Acceso del comprador autenticado, aislamiento, consentimiento de proveedores, deduplicación, ausencia de fugas y prueba de descarga real desde móvil/navegador.
- [ ] Operación sin intervención humana **en el caso normal**; ambigüedades genuinas van a revisión segura sin bloquear las respuestas válidas restantes.

**Hasta pasar esta prueba completa, el piloto NO está terminado.**

## 7. Gobernanza y autoridad

**«Auditá»** = leer, sin mutar. **«Documentalo» o «reorientá»** = editar documentación/checklist/issue en rama y dejar PR; no modificar piloto. **«Luz verde» / «Avanza»** = desarrollar y probar en rama, **NO publicar**. **«Publicalo»** = desplegar exclusivamente versión y entorno autorizados, con CI, rollback, controles de permiso y autorización explícita.

**Fuente operativa única:** [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y estos tres documentos V2. Toda nueva conversación debe revisar **[Estado V2](PILOTO-100-ESTADO.md)** antes de elegir tarea. Las reglas aquí reemplazadas **NO vuelven a entrar en vigor** por abrir un chat nuevo. Si una regla V2 cambia, crear decisión registrada en `docs/10-decisiones.md` y actualizar este contrato, el plan y el estado **en el mismo PR**.

