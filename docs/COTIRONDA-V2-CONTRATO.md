# COTIRONDA V2 — CONTRATO CANÓNICO DEL PRODUCTO

**Decisión del propietario: 12/11/2026. Estado: APROBADA COMO DIRECCIÓN DE PRODUCTO, NO IMPLEMENTADA NI DESPLEGADA.**

> **PRECEDENCIA OBLIGATORIA:** este documento reemplaza las decisiones funcionales anteriores en lo que contradigan Cotironda V2. Para ejecutar trabajo leer primero: **este contrato → [Plan maestro V2](PILOTO-100-PLAN-MAESTRO.md) → [Estado/relevo V2](PILOTO-100-ESTADO.md) → [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794)**. README y AGENTS deben apuntar aquí. La documentación en `docs/historico/`, PR anteriores y memorias de chat son evidencia histórica, **no instrucciones activas**. Toda duda se registra como decisión explícita, no se resuelve recuperando una regla vieja.

## 1. Qué vendemos (una oración)

**Cotironda solicita cotizaciones de materiales de obra a comercios pertinentes, conserva y presenta sus presupuestos originales identificados, analiza cada respuesta para orientar al comprador y, al cerrar, entrega una comparación general con recomendaciones razonadas.**

No somos una bolsa de archivos, un ranking anónimo, un intermediario que oculta negocios ni un sistema que elige ganadores automáticamente. El valor es **conseguir respuestas, organizar los originales y ayudar a decidir sin trabajo manual**.

**Clientes:** arquitectos, estudios, constructoras y compradores de materiales especificables. **Proveedores:** comercios con catálogos propios de productos concretos y área de entrega. El rubro es solo una etiqueta organizativa, nunca criterio de selección. Proveedores gratis/sin comisiones. Abono de compradores estimado **$10.000 ARS/mes** y prueba gratuita **a validar**; medir costos reales antes de prometer ilimitados.

## 2. Circuito único de extremo a extremo

1. **Pedido del comprador:** texto, foto, PDF, Excel, Word, o documento recibido por canal habilitado (WhatsApp prioritario, web cuando aplique). IA detecta materiales, cantidades, unidades, variantes, rubros y zona de entrega. Si falta zona/localidad, hacer **una única pregunta imprescindible**; no exigir al comprador editar o reconfirmar el pedido en el flujo normal. La distribución requiere una fuente de pedido confiable y una identidad autorizada; esa validación de seguridad sucede sin fricción innecesaria.
2. **Distribución selectiva por PRODUCTO (D013):** la IA cruza cada renglón del comprador contra los productos concretos del catálogo propio de cada proveedor y su zona. Envía únicamente ítems coincidentes o alternativas técnicamente compatibles, aunque el negocio comercialice distintos rubros. **Nunca filtrar por nicho/rubro.** La marca no es excluyente salvo pedido expreso; se reconocen sinónimos y presentaciones comparables con conversiones verificables. Un proveedor puede recibir solo una parte del pedido. Catálogo no implica stock. Cada solicitud incluye una referencia única sin trabajo extra del proveedor.
3. **Respuesta libre del negocio:** texto, foto, PDF, Excel, Word, audio compatible o combinaciones, sin formularios, ediciones ni confirmaciones rutinarias. Conservar el **archivo original exacto** (bytes, tipo, SHA, origen, fecha y proveedor) o el texto exacto del mensaje. Una respuesta puede incluir artículos adicionales, pallets, condiciones o correcciones: **no mutilar el original**.
4. **Vinculación segura de la respuesta al pedido:** webhook autenticado y deduplicado; relacionar por remitente, mensaje citado/ID, referencia explícita, contexto suficientemente inequívoco y evidencia histórica compatible. **Nunca** asignar por similitud de fecha si hay ambigüedad. Si una respuesta no puede asociarse, queda en **revisión interna** y NO aparece como presupuesto de la ronda; no pedir automáticamente al comercio reenviar.
5. **Publicación inmediata para el comprador:** tras la asociación correcta y permisos de acceso, **aparece el nombre del negocio que respondió**, el **original descargable** y su **análisis individual**. Si el análisis todavía se está generando, indicar `Análisis en preparación`; **nunca bloquear el original por un parser que falló**. Si no es posible mostrar el original de forma legal/segura, no anunciarlo como disponible.
6. **Durante la ronda:** el comprador ve **EXCLUSIVAMENTE negocios que ya respondieron**. No mostrar nombres de invitados que no respondieron, listas de pendientes, cantidad total de negocios consultados, contador de faltantes ni supuestos ganadores. Si no hay respuestas: `Todavía no recibimos cotizaciones`. No usar ranking global mientras la ronda esté abierta. Los comercios no ven documentos de competidores.
7. **Cierre:** duración predeterminada **DOS DÍAS HÁBILES**, **NO 48 horas de trabajo**; fecha y hora exactas de cierre visibles desde el inicio y calculadas con zona `America/Argentina/Buenos_Aires`, fines de semana y calendario de feriados aplicable. **Regla operativa inicial propuesta para prueba:** cierre 18:00 del segundo día hábil siguiente al envío. Validar el calendario (incluidos feriados locales) antes de activar cron; plazo configurable. No inventar entregas ni respuestas tardías: separarlas y registrar cierre.
8. **Informe final:** al vencer, comparar **todas las cotizaciones válidamente asociadas recibidas en plazo** por rubro, cobertura, artículo equivalente, presentación, cantidades, IVA, flete, descuentos, disponibilidad, entrega y pago. Generar conclusiones **justificadas**, alternativas de compra con uno o varios proveedores cuando corresponde, riesgos, ahorros SOLO comprobables y recomendaciones. Si solo hay una oferta, informar que no existe comparación; si ninguna, cerrar sin inventar un ganador. Originales siguen accesibles según permisos.

## 2.1 Catálogos y equivalencias — D013

**Regla aprobada y obligatoria:** [D013 — Matching por producto y equivalencias técnicas](V2-D013-CATALOGOS-EQUIVALENCIAS.md). La IA debe entender nombres comerciales/genéricos y cambios de marca/presentación (Ceresita ↔ hidrófugo compatible; cemento 50 kg ↔ 25 kg del mismo tipo), sin violar especificaciones excluyentes ni confundir cantidad de bolsas con masa total. Ningún proveedor se invita solo por rubro. El detalle y las pruebas exigidas están en D013; esta decisión todavía NO está implementada en el piloto.

## 2.2 IA Central como responsable operativa — D014 (12/11/2026)

**La IA Central coordina automáticamente el circuito completo.** El arquitecto y el proveedor NO cargan calendarios, validan feriados, calculan equivalencias, normalizan precios ni editan el presupuesto como requisito rutinario para cotizar. Su única aclaración normal es la localidad de entrega si falta. No pedir confirmaciones cotización por cotización.

- **Semántica de productos:** IA interpreta sinónimos, marcas, prestaciones y presentaciones para cualquier rubro de obra, contrasta líneas exactas de catálogo y documentación técnica de fuente real. Rubro es etiqueta, no filtro. Una alternativa incierta va a revisión interna sin bloquear otros renglones seguros; no forzar coincidencias por nombre parecido. La comprobación de unidades/cantidades es determinista y nunca inventa IVA, flete, disponibilidad o precios. Marca obligatoria expresamente se respeta.
- **Calendario:** IA Central coordina la consulta y actualización periódica de fuentes oficiales nacionales/provinciales/municipales y un contraste independiente, con fecha, alcance, cobertura, provenance y trazabilidad. El cálculo de **2 días hábiles, 18:00 hora Buenos Aires**, lo realiza un motor determinista; NO una respuesta libre del modelo. Se distinguen feriados obligatorios de días no laborables/optativos; el comercio no se supone cerrado por un día optativo salvo regla comercial acreditada.
- **Autonomía segura:** una discrepancia, falta de fuente o dato técnico dudoso activa recuperación/revisión interna y registro; no una pregunta al arquitecto o proveedor ni un plazo inventado. La gestión de fuentes debe ser automática de servidor a servidor y el calendario versionado. Los modelos NO crean feriados, documentos de fabricantes, permisos de publicación ni tiempos económicos por inferencia.
- **Seguridad y publicación:** IA Central interpreta y coordina, pero autentificación, consentimiento, vinculación de originales, cálculo de vencimientos y autorización de envíos se verifican por código/SQL. No se habilitan envíos reales ni migraciones hasta desplegar la versión aprobada. No reintroducir fricción artificial para compensar fallos de seguridad.

**Estado:** D014 es dirección APROBADA. El [PR #823](https://github.com/ProtectorRudo/Cotironda/pull/823) prepara orquestador de calendario y productos, pero **NO está desplegado, no sincroniza todavía un recurso JSON oficial confirmado con la base real, ni hay E2E**. El calendario anual manual del PR #821 es un preflight interno, NO un paso del comprador/proveedor ni una obligación permanente de carga manual.

## 2.3 Publicación por etapas seguras (D015, 12/11/2026)

**Publicación de infraestructura no es activación comercial.** Primero, tras autorización expresa `Publicalo`, se pueden instalar en **PILOTO** las tablas/RPC privadas, lector Edge PDF y portal Preview **con todas las banderas V2 OFF** y sin enviar WhatsApps. Esta primera fase no requiere que ya exista el arquitecto en Auth. No se despliega en producción.

En segunda fase, se da de alta de manera segura al comprador mediante operador/flujo de onboarding apropiado, sin pedirle confirmaciones de presupuesto. La pantalla OTP de V2 usa `shouldCreateUser:false`, por lo que **no registra automáticamente al primer comprador**. Se comprueba también consentimiento prospectivo V2 de los proveedores para revelar su nombre y presupuestos originales al comprador, sin inferirlo de su alta genérica en WhatsApp.

**La activación** de la vista del primer presupuesto privado se hace únicamente una vez demostrados Auth, consentimiento, asociación de documento firme, preview protegida, SHA exacta de build, original descargable y análisis sin inventar importes. Luego se habilita el cierre a 2 días hábiles según calendario oficial automático y se ensaya una ronda real con dos proveedores e informe general. Todas las migraciones, cambios de entorno, activaciones y envíos del piloto requieren nueva autorización `Publicalo` para el alcance concreto.

El guard de [PR #827](https://github.com/ProtectorRudo/Cotironda/pull/827) distingue `primer_original` de `piloto_completo` y **no publica nada nunca**. Una CI verde no prueba el flujo real. `Avanza` continúa significando desarrollo/pruebas, no instalación.

## 2.4 Alta segura de compradores piloto — D016 (12/11/2026)

Para ver los presupuestos originales, el comprador debe poder probar que controla **el mismo teléfono de la empresa que envió el pedido por WhatsApp**, mediante Supabase Auth y una sesión vigente. **La primera cuenta se prepara únicamente por servidor autorizado**: el registro general permanece cerrado (`shouldCreateUser:false` en OTP). No basta saber el nombre de la empresa, compartir un enlace o tener el teléfono en un catálogo.

El operador verifica previamente la identidad Whapi del comprador y su consentimiento mediante una función privada. El teléfono de Auth debe coincidir inequívocamente con la huella SHA del canal WhatsApp ya autenticado; si hay ambigüedad, opt-out o dato faltante, no se crea la cuenta. La creación inicial es `phone_confirm:false`; **ningún administrador debe marcar un número como confirmado por comodidad**. El SMS OTP real es la prueba de posesión del teléfono antes del acceso y debe verificarse en PILOTO (incluida la configuración del proveedor SMS). La interfaz puede solicitar el código de ingreso, no confirmaciones repetidas por presupuesto.

`Avanza` habilita código, simulaciones y controles PostgreSQL17 con rollback; `Publicalo` habilita solo la instalación PILOTO y el alta del comprador en el entorno expresamente autorizado. La política privada de originales y el consentimiento prospectivo de cada proveedor siguen siendo obligatorios. No se puede inferir que cualquier usuario Auth puede ver cualquier ronda, ni que `auth.users>0` equivale a identidad verificada. [PR #828](https://github.com/ProtectorRudo/Cotironda/pull/828).

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

- [ ] Comprador envía pedido real; Cotironda identifica productos, zona y coincidencias de catálogo **por artículo (D013)**, sin envíos basados solo en rubro, con equivalencias técnicas verificadas.
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

