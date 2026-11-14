# Cotironda V2 — mensaje de alta único para compartir presupuestos originales

**BORRADOR NO APROBADO — NO ENVIAR / NO ACTIVAR POLÍTICAS.** Fecha: 14/11/2026. Referencia [PR #846](https://github.com/ProtectorRudo/Cotironda/pull/846). Este archivo NO otorga consentimiento ni registra aceptaciones. Antes de habilitar, revisar el texto legal, identificar responsable y completar datos reales. Proveedor que cotiza NO consiente por ese solo hecho.

## Texto propuesto para WhatsApp (una sola vez al incorporarse)

> Hola. Te damos la bienvenida a **Cotironda**. Vas a recibir solicitudes de materiales por WhatsApp y podés cotizarlas respondiendo normalmente, sin formularios.
>
> Para mostrar tus presupuestos originales en nuestra plataforma, necesitamos tu autorización expresa. Si aceptás, cuando respondas una solicitud **futura**, Cotironda podrá conservar tu respuesta y permitir que el comprador verificado de **esa solicitud** consulte tu **nombre comercial** y el presupuesto original que enviaste (texto, PDF, Excel, Word o imagen), incluyendo precios y condiciones y los datos de contacto que hayas incorporado al archivo. Los originales no estarán disponibles públicamente ni para otros proveedores. Se usan exclusivamente para analizar ofertas y facilitar la decisión del comprador. Tu cotización puede analizarse automáticamente, pero el original es la fuente de verdad.
>
> **Responsable del tratamiento:** [NOMBRE O RAZÓN SOCIAL LEGAL DEL OPERADOR DE COTIRONDA], [DOMICILIO DEL RESPONSABLE]. **Contacto para privacidad y ejercicio de derechos de acceso, rectificación y supresión:** [CORREO O CANAL FORMAL VERIFICADO].
>
> Podés negarte a autorizar originales y seguir recibiendo solicitudes y enviando cotizaciones; en ese caso **no publicaremos esos originales en el portal del comprador**. No te pediremos confirmar este permiso en cada presupuesto. Si querés revocarlo, escribí **NO COMPARTIR** desde tu WhatsApp registrado: bloquearemos nuevas visualizaciones autorizadas desde Cotironda a partir de la revocación. La revocación no elimina copias que un destinatario legítimo ya hubiera descargado.
>
> Evitá incluir datos personales de terceros que no sean necesarios para cotizar o que no estés autorizado a comunicar; si aparecen, Cotironda podrá retener el original sin exhibirlo mientras se revisa su tratamiento. Conservaremos los datos durante **[PLAZO DE RETENCIÓN APROBADO]**, con las obligaciones legales que correspondan.
>
> **Si estás de acuerdo con lo anterior, respondé exactamente: ACEPTO COTIRONDA ORIGINALES V2.** Si no, podés seguir cotizando, pero sin compartir originales con compradores.

## Requisitos de aprobación ANTES del envío

- [ ] Definir identidad o razón social real del responsable de Cotironda, domicilio físico y canal formal de derechos de datos; no inventarlos.
- [ ] Definir plazo real de conservación y procedimiento efectivo de eliminación y revocación; asegurar que el sistema cumpla lo prometido (incluida prohibición de links abiertos o descargas después de revocación).
- [ ] Revisar jurídicamente conforme Ley argentina 25.326 arts. 5, 6, 10 y 11, y Decreto 1558/2001. Particular cuidado: presupuestos pueden incluir datos personales de empleados/terceros y su titular puede ser distinto del proveedor que responde. Su autorización comercial no necesariamente cubre esos datos.
- [ ] Definir si la cotización sin permiso puede seguir circulando al comprador como mero análisis sin original: el flujo V2 vigente exige original autorizado; sin permiso, **retener del portal**.
- [ ] Validar explícitamente el texto final exacto y su versión, SHA-256 de cuerpo íntegro, fecha/hora y referencia de aprobación en `v2_d016_supplier_terms_policy`; mantener **OFF** hasta ese punto.
- [ ] Enviar el **texto completo aprobado** desde un único onboarding por WhatsApp a un proveedor nuevo o ya existente sin consentimiento V2; registrar mensaje Whapi aceptado por API en `v2_d016_supplier_terms_deliveries` y aceptar SOLO respuesta posterior exacta `ACEPTO COTIRONDA ORIGINALES V2` del mismo chat autenticado.
- [ ] Respetar `NO COMPARTIR` global y exigir un **nuevo aviso completo** posterior a la revocación para reaceptar (guard instalado migración `20261114053740`); no reutilizar un aviso anterior.
- [ ] No inferir aceptación a partir de cotizar, silencio, alta genérica, documentos anteriores ni WhatsApp ya archivados. Política de originales V2 y negocios OFF hasta prueba comercial autorizada.

## Fuentes oficiales consultadas

- [Ley 25.326 (texto oficial actualizado)](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion): arts. 5 (consentimiento), 6 (información), 10 (confidencialidad), 11 (cesión y revocación).
- [Decreto 1558/2001 (texto actualizado)](https://www.argentina.gob.ar/normativa/nacional/70368/actualizacion): información previa y revocación no retroactiva.

**Límite:** este texto es propuesta de implementación y revisión, no dictamen legal ni condiciones aprobadas. No enviar/activar como si existiera consentimiento. No toca entorno piloto, Edge, Vercel ni producción.
