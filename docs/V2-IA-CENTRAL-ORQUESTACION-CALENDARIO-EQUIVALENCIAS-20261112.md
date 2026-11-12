# Cotironda V2 — IA Central gobierna calendario, equivalencias y flujo

**12/11/2026 · decisión de arquitectura operativa.** Código en PR, **NO desplegado** y sin mensajes reales. Complementa D013 y el contrato V2; no vuelve a los rankings, anonimato ni confirmaciones por presupuesto de versiones anteriores.

## Autoridad y responsabilidades (sin trabajo adicional para usuarios)

**IA Central:** orquesta etapas y reintentos: interpreta pedido libre, extrae cantidades/especificaciones, localiza productos del catálogo individual por zona, razona equivalencias y riesgos, consulta las fuentes del calendario, analiza cada original auténtico y al cierre produce informe por rubro/productos. No pide una ficha para cada cotización ni exige edición del comprador/proveedor.

**Conectores de fuentes:** datos reales de catálogo autenticado y normativa oficial de feriados, con sello de actualización, trazabilidad, localidad/provincia y cobertura. IA puede descubrir/resumir fuentes, pero **NO convierte su respuesta narrativa en un feriado oficial, un catálogo nuevo, una ficha técnica ni una autorización**.

**Motor determinista y permisos:** calcula vencimiento y equivalencia nominal exacta, valida permisos por empresa, consentimiento previo, hash de origen y restricciones expresas. La IA no decide en soledad si una marca es excluyente o una unidad convierte a otra. El documento proveedor original sigue siendo la fuente de verdad.

**Automatización interna:** si un proveedor no informa tipo/espesor/uso técnico, se descarta solo esa relación insegura, sin frenar pedidos parciales válidos ni pedirle intervención a cliente o proveedor. Si una fuente de feriados falla o se contradice, reintento controlado y registro de revisión *interna*. No enviar cotizaciones con plazos inventados.

## Código que se agregó

- `src/domain/ia-central/calendario-conciliado-automatico-v2.ts`: reconcilia fechas **anuales de dos fuentes independientes**, dominio/HTTPS, localidad, tipos obligatorios y optativos. Calcula automáticamente **18:00 del segundo día hábil posterior** usando Argentina/Buenos_Aires, incluidos fines de semana, feriados y cruce de año con fuentes del año siguiente. Ante discrepancia, fecha inválida o año faltante, devuelve `revision_automatica` sin inventar vencimiento.
- `src/server/v2-ia-central-fuentes-feriados.ts`: adaptador de lectura pública JSON con dominio permitido, HTTPS obligatorio, sin cookies/tokens, sin redirects, límite 100 kB y timeout 8 s. La URL de recurso gubernamental exacta se debe **verificar y configurar** en el servidor del piloto; aquí no se inventa un recurso oficial que no fue confirmado.
- `src/server/v2-ia-central-orquestador-operativo.ts`: único flujo de propuesta previa, exige fuente del mensaje autenticada y catálogos ya autorizados, comprueba el calendario ANTES de gastar una llamada de IA, y recién luego ejecuta el matching semántico de productos D013. Devuelve `propuesta_verificada_sin_envio` o revisión interna, nunca escribe SQL ni manda WhatsApp.
- Tests: dos fuentes concordantes, contradicción parcial, localidad sin cobertura, feriado optativo de industria/comercio, turismo no laborable, nacional trasladado, cruce 2026–2027, HTTP inseguro, data inválida, llamada IA evitada ante fallo de calendario y propuestas parciales.
- No se alteraron archivos del webhook vivo v76 ni su manifiesto SHA, ni el ruteador anterior.

## Fuentes verificadas y precauciones

**Fuente primaria nacional**: dataset de Jefatura de Gabinete [Feriados Nacionales — datos.gob.ar](https://www.datos.gob.ar/dataset/jgm-feriados-nacionales), publicación anual. **Contraste**: [API ArgentinaDatos](https://argentinadatos.com/docs/operations/get-feriados), que expone fechas y tipos. **Fuente legal municipal**: [Resolución 516/2026 PBA](https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224) para las festividades de noviembre y su alcance optativo en comercios. **Regla:** un feriado optativo **no es** automáticamente cierre de todos los negocios; por defecto se cuenta como hábil salvo adhesión registrada. **No cargar años incompletos como aprobados.**

La consulta pública al portal nacional expone una página de feriados de calendario dinámico cuya indexación muestra diferencias con listados de contraste; la decisión de producto es **detener la conciliación en discrepancias**, nunca aceptar la primera fecha que la IA encuentre. Exigir fecha exacta + tipo + jurisdicción y fuentes archivadas.

## Qué falta para que esto funcione en el PILOTO real

1. Conectar el recurso **JSON oficial exacto** verificado y el lector del boletín/norma local, hacer sincronización periódica autenticada en el servidor con snapshot y registros de actualización (sin pasos de usuarios). La API secundaria documentada no reemplaza fuente oficial.
2. Conciliar el calendario **vigente** con las tablas/funciones SQL V2-05 del PR #821: hoy el SQL pide calendario anual aprobado. El orquestador nuevo no marca `approved_at`, y esa aprobación necesita un proceso de ingestión de fuentes **automático y auditado**, con versionado y rollback. No encender flag hasta probarlo.
3. Mantener criterio técnico **generalista**: IA entiende sinónimos, equivalencias y marcas sin diccionario fijo; guardia actual detecta varias contradicciones evidentes. Las fichas técnicas deben provenir de catálogo/documentación real, no del razonamiento autónomo del modelo. Para «Ceresita» y un hidrófugo no basta similitud verbal si faltan usos/composición. Resolver automáticamente cuando haya evidencia, retener solo alternativa dudosa.
4. Buyer Auth y consentimiento prospectivo de proveedores; unificar app de Vercel PILOTO y preflight de Edge v76; completar análisis individual y global, luego E2E 1 comprador + 2 proveedores.
5. **Publicalo** requerido para toda instalación SQL, modificación Edge/Whapi y activación de flags. No enviar mensajes ni alterar rondas históricas en esta rama.

**Criterios de aceptación:** código/CI de orquestación, lectura de fuentes verificables y cierre matemático + protección de catálogos/consentimientos, luego instalación autorizada, finalmente E2E real; son hitos diferentes.
