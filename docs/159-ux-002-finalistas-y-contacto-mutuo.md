# 159 — UX-002 / MVP-039: finalistas automáticos y contacto recíproco, sin adjudicación

**31/10/2026 · decisión comercial APROBADA expresamente por el propietario · Issue #291.**

## Qué cambia

La versión anterior exigía que el arquitecto eligiera o «adjudicara» dentro de Cotironda, para recién después permitir compartir teléfonos. **Esa regla queda SUSTITUIDA.** Cotironda es un servicio de solicitud, recepción, clasificación y **presentación de contactos comerciales**, NO un sistema de órdenes de compra ni una subasta con aceptación contractual automática.

**El arquitecto no elige a quién adjudicar en la plataforma.** Manda un PDF, Excel, Word, foto o texto por WhatsApp. Nuestra IA extrae materiales y pide localidad SOLO si falta. Cotironda invita automáticamente comercios autorizados del catálogo compatible con zona. Cada comercio responde por WhatsApp; la IA atribuye y registra su presupuesto recibido de manera versionada, sin «Confirmo» adicional para una respuesta identificada. Terminado el plazo, las reglas deterministas seleccionan **hasta dos presupuestos finalistas válidos por alcance comparable/rubro**. **Automáticamente, sin nuevo clic ni adjudicación**, Cotironda permite conocer el nombre y contacto comercial entre el arquitecto y cada finalista. Ambos se contactan y pueden comprar o no, **fuera de la plataforma**.

**Finalista significa oportunidad de contacto, no venta adjudicada, ganada, reservada o garantizada.** El plazo de cierre depende de la solicitud. A otros participantes se puede avisar neutralmente que terminó la ronda, pero no divulgar competidores ni sus datos.

## Protección y elegibilidad antes de revelar

1. **Antes del envío inicial**, comprador y proveedor conocen y aceptan expresamente que, si quedan finalistas, se compartirá **mutuamente** su nombre comercial y el contacto habilitado. Es una regla de participación visible, no un diálogo de confirmación posterior. No confundir la autorización para distribuir materiales con consentimiento expreso de contacto si no se informó la consecuencia.
2. Solo el backend autorizado y autenticado toma el snapshot de cierre real: fecha/hora del servidor, ronda NO cancelada, recibidas a tiempo y versión correcta. Nunca elegir desde un body cliente, WhatsApp no verificado o IA que propone ganadores.
3. Por **rubro/canasta técnicamente equivalente**, comparar cobertura, cantidad, unidad, especificación, moneda, IVA y flete INFORMADOS, mínimos, disponibilidad y pago/plazo. Ningún ranking de totales de presupuestos parciales o incomparables. Marcas distintas requieren compatibilidad verificada. Los precios se calculan con motor decimal D022, no con IA.
4. Hasta dos **finalistas**, nunca inventar un segundo si solo existe uno. No tratar empate para el último lugar como «victoria» arbitraria; enviar a revisión interna antes de cualquier revelación. Cuando las condiciones no son comparables (p. ej. contado vs 30 días), no atribuir un orden de precios automáticamente.
5. No revelar contactos si hubo baja del contacto, cancelación, revocación de consentimiento, identidad sin verificar o destinatario ambiguo. El proveedor ve solo datos del arquitecto y su propia oferta; **nunca** los de competidores. El arquitecto ve solo los finalistas y su información autorizada. Un proveedor no finalista NO obtiene teléfono ni identidad del comprador.
6. La **revelación mutua** es la única fase que exige datos de contacto. Debe tener un registro durable único por ronda/proveedor, auditar permisos/RLS, permitir reintentos idempotentes sin re-notificar de más, gestionar fallos de envío sin declarar contacto entregado si no se entregó. Los datos se envían únicamente a identidades enlazadas y verificadas con opt-in vigente.
7. No hay botón «Adjudicar», «Elegir ganador» ni «Confirmar compra» en el flujo del comprador. Tampoco gestión de pagos, comisiones, contratos o adjudicación dentro de Cotironda. Contacto compartido no constituye aceptación de ninguna oferta.
8. La IA puede extraer, resumir y buscar evidencias, **pero no decide los dos finalistas por texto libre**. El cierre selecciona con matemática determinista, trazabilidad de fuentes y reglas explicables.

## Código de contrato actual

`src/domain/finalistas-automaticos-mvp039.ts` identifica **IDs anónimos solamente**, sin contacto real, sin ninguna llamada de red ni persistencia. Exige cierre, vencimiento, consentimiento previo y vinculación verificable de cada oferente; reusa `compararCotizacionesOffline` y por seguridad **solo elige cotizaciones individuales que cubran la canasta comparable completa**. Si hace falta cubrir la canasta mediante dos presupuestos parciales (D022), ese **segundo modo de elección** todavía no tiene reglas de revelación y debe resolverse antes de uso real, sin fingir que la suma de totales parciales es comparable. Los rubros se procesan por canastas independientes; el código aún NO segmenta ni clasifica por rubro: esa entrada debe venir de backend confiable.

**IMPORTANTE:** la salida `contactosRevelados:false` es deliberada. Este PR implementa selección anónima **solo offline**. NO implementa WhatsApp de ingreso del arquitecto, cálculo comercial alojado, consentimiento real, trigger del cierre, disclosure, mensajes a clientes ni portal comercial activo.

## Requisitos de prueba y piloto

- Un presupuesto finalista válido, dos válidos con precios distintos, dos empatados, tres empatados donde el corte de segundo lugar es incierto; cobertura parcial barata, IVA/flete omitidos, diferentes condiciones y monedas, comprador o proveedor sin autorización, identidad/canal dados de baja, cierre anticipado, ronda cancelada, ataque de ID ajeno.
- Probar durante el piloto real un mensaje comprador → consulta proveedor → respuesta atribuida → cierre → *comunicación recíproca real autorizada*, sin ninguna elección en plataforma; un vendedor sin ganar no recibe contacto.
- No habilitar contacto real hasta #175 (backup y recuperación auténticos), migraciones comerciales DEV, prueba de seguridad RLS, onboarding/consentimientos y Whapi real. No publicar `main` ni DNS.

## Normas sustituidas, no eliminadas silenciosamente

D006 y las menciones «adjudicación manual» de UX-001/docs/02/docs/05/docs/08/docs/09/docs/10/docs/89 y en código DEMO pasan a ser **históricas**. El motor D022 y el reducer D023 siguen marcando `adjudicacionAutomatica:false` porque **no crean órdenes de compra**, no porque el arquitecto deba hacer clic. La demo MVP-038 de selección visual es un prototipo previo y **NO define el recorrido aprobado**. UX-002 tiene prioridad ante cualquier contradicción documental y debe guiar el próximo cambio de interfaz/WhatsApp.
