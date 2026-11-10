# Decisión 436 — Autorización única de incorporación, cero permisos por ronda

**Fecha:** 07/11/2026 (ART). **Solicitado por el responsable de Cotironda:** «a partir de ahora ... si un arquitecto, cliente, proveedor o cualquiera que forme parte de Cotironda, si está es porque nos dio autorización a todo, no le tenemos que pedir para nada». **Tipo de cambio:** decisión de producto documentada, sin autorización para modificar código, ejecutar migraciones ni publicar. **Estado:** política aprobada para el diseño futuro; implementación pendiente de adecuación.

## Regla de producto

La incorporación a Cotironda debe tener **una única aceptación informada de las condiciones del servicio**, vinculada a la identidad o empresa y a una versión de las condiciones. Esa aceptación cubre las actividades habituales **específicamente enumeradas y previamente informadas**, según el rol. Una vez aceptada y vigente, Cotironda opera automáticamente **sin repreguntar permisos, consentimientos, confirmaciones ni códigos en cada ronda**.

La participación **NO prueba consentimiento universal a finalidades que no fueron informadas**, ni autoriza divulgar datos fuera del alcance indicado. La experiencia debe ser sin fricción, pero la autorización no se inventa: se registra y se verifica en segundo plano.

### Alcance que las condiciones iniciales deben explicar claramente

- **Comprador/arquitecto:** recepción de pedidos por texto, fotos, PDF, Word o Excel; procesamiento documental con IA; preguntas sólo por información indispensable para cumplir el pedido (por ejemplo, localidad); distribución por rubro/zona a proveedores elegibles; presupuestos recibidos, informes de cobertura y precios, comparación verificable y enlace privado de seguimiento; notificaciones razonables.
- **Proveedor:** recepción de solicitudes por WhatsApp; tratamiento de su catálogo, documentos, precios y respuestas; participación en rondas; anonimato comercial durante la ronda; identificación del nombre comercial de **todos** los negocios invitados, hayan cotizado o no, una vez cerrado el plazo; revelación al comprador del **WhatsApp comercial de ese negocio** si esa finalidad fue clara, destacada y aceptada de forma acreditable al incorporarse.
- **Otros participantes:** aceptar únicamente finalidades ligadas a su rol real y permisos que correspondan, no una autorización indiscriminada.
- **Para todos:** tratamiento limitado y seguro, evidencia de aceptación con versión/fecha/alcance/identidad, acceso por empresa, revocación y vías de derechos legales.

### Invariantes no negociables

1. **Ninguna confirmación de pedido del arquitecto**: el sistema interpreta, valida y despacha solo cuando hay evidencia suficiente. Únicas preguntas conversacionales: datos de negocio esenciales o ambigüedades relevantes; nunca «CONFIRMAR COTI».
2. **Ningún proveedor debe aprobar su participación ni pedir autorización en cada solicitud**. Su adhesión vigente basta para las funciones cubiertas.
3. **Siempre se revelan al cierre los nombres comerciales de todos los proveedores invitados** para rondas elegibles, no solo dos ganadores. El WhatsApp comercial de cada proveedor se revela únicamente cuando exista permiso informado y acreditado para esa finalidad; no asumirlo del número conocido.
4. **Los datos personales y de contacto del arquitecto nunca se comparten automáticamente con proveedores.** El hecho de aceptar condiciones no levanta esta protección. Los originales y PDF deben depurarse para evitar fugas indirectas.
5. Nunca usar la aceptación para justificar finalidades nuevas, contacto con terceros ajenos, divulgación prematura o reenvíos duplicados.
6. La revocación efectiva y los cambios materiales en los términos deben respetarse. Cotironda no podrá exigir que alguien renuncie a derechos legales.

## Tratamiento de altas existentes

Los usuarios registrados antes de incluir esta finalidad en las condiciones **no se consideran retroactivamente autorizantes de divulgaciones nuevas**, como compartir un WhatsApp que aún no habían autorizado mostrar.

- **Nuevas altas:** incorporar claramente este alcance **en el mismo acto de alta**. Una acción de aceptación, no una segunda pregunta.
- **Altas actuales con evidencia suficiente:** usar la aceptación ya registrada, sin pedir nada más.
- **Altas actuales sin evidencia suficiente para una divulgación nueva:** mantener el dato protegido hasta acreditar su habilitación para esa divulgación; la mera permanencia en Cotironda no autoriza falsificar consentimiento. Evitar bloquear otros usos lícitos que sí estén cubiertos.
- La experiencia propuesta para actualizaciones de condiciones es **una única adecuación informada al ingresar de nuevo**, sin pedir consentimiento por cada ronda. Evaluar alcance legal antes de publicar.

## Criterios de aceptación para implementación futura

1. Una única aceptación de términos por incorporación, verificable (participante, rol/empresa, versión, sello temporal, origen autenticado, texto de condiciones aplicable, revocación).
2. Ningún diálogo o formulario de consentimiento durante una cotización normal; no crear autorizaciones silenciosas.
3. Comprobaciones de consentimientos/permisos en código/SQL, sin redirigir esas comprobaciones al cliente ni al proveedor.
4. Entorno piloto no revela teléfonos de participantes existentes sin base acreditada; no muestra comprador; siempre aplica fecha de cierre, token y control de empresa.
5. Pruebas normales/adversariales: alta nueva, usuario histórico, aceptación desactualizada, revocación, suplantación, empresa ajena, intento de revelar antes del cierre, contacto personal embebido en PDF, rerun e idempotencia.
6. No se cambia un gate, permiso, API, Edge o mensaje real mediante esta acta; cualquier modificación requiere «Luz verde» y publicar requiere «Publicalo».

## Relación con decisiones anteriores

Esta decisión concreta y prioriza **sin fricción por ronda** sobre las propuestas [334](334-decision-permisos-de-alta-sin-friccion.md), [434](434-mvp306-sin-confirmacion-y-contactos-proveedor.md) y [435](435-mvp307-alta-unica-consentimiento-y-ruteo.md). El PR #702 ya contempla una única aceptación para altas nuevas, pero todavía debe auditarse la experiencia final para que no agregue pasos evitables a ningún rol. El código actual no convierte permisos ausentes en permisos verdaderos.

## Fundamento normativo para implementación

- **Ley 25.326**, artículos 4, 5, 6 y 11: finalidades, información previa, consentimiento cuando corresponda y cesión de datos personales.
- **Decreto reglamentario 1558/2001**, artículo 5: consentimiento informado y posibilidad de revocación.
- Fuentes oficiales: https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto y https://www.argentina.gob.ar/normativa/nacional/70368/actualizacion.

**Estado comprobado al registrar:** PR #702 en borrador; no se implementa ni publica esta política mediante el presente documento. No se envía WhatsApp ni se ejecuta SQL en `cotironda-piloto`.
