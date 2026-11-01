# 05 — WhatsApp y Whapi (diseño; SIN conexión actual)

> **UX-002 es la regla vigente:** no hay adjudicación en Cotironda. Al cierre de la ronda, se identifican hasta dos presupuestos finalistas comparables por rubro; se revelan recíprocamente datos de contacto SOLO entre arquitecto y cada finalista con consentimiento previo y verificación. No se revela a perdedores ni otros proveedores. La compra se pacta fuera de Cotironda. [docs/159](159-ux-002-finalistas-y-contacto-mutuo.md).

## UX-001 — canal principal de trabajo
**WhatsApp no es un complemento de notificaciones: es la vía de uso preferida para comprador Y proveedor.** El comprador puede mandar su lista y consultar el avance; el proveedor puede recibir, responder, corregir y confirmar sin portal. La plataforma interpreta, registra y sincroniza estados sin obligar a copiar presupuestos. El portal queda como opción para control, comparación y adjudicación manual; no como curso obligatorio para operar.
- Evitar menús conversacionales interminables, comandos rígidos, mensajes masivos, preguntas repetidas y requisitos de descargar aplicaciones. Mensajes breves, humanos y con siguiente paso claro.
- Diferenciar «mensaje recibido», «borrador», «esperando confirmación» y «oferta confirmada». No declarar «presupuesto entregado» antes de confirmación efectiva; informar fallas/pendientes sin hacer repetir al proveedor la respuesta.
- No aceptar precios inventados, ni envíos sin consentimiento, ni contacto indebido. Confirmación de precio y opt-out deben poder resolverse de forma sencilla por el canal.
- Comprador no recibe «ganador» al vencer siete días automáticamente: **cierra la recepción, se identifican hasta dos finalistas comparables y se habilita el contacto mutuo consentido automáticamente**.
- Antes del piloto probar el recorrido entero en celulares de personas no técnicas de ambos roles y medir si necesitan ayuda para completar pedido/cotización.
**Implementación WhatsApp real aún pendiente.** [Criterios UX-001](89-ux-cero-friccion-whatsapp-first.md).

## Propósito
El proveedor puede cotizar sin aprender un portal. WhatsApp ofrece invitaciones, envío de archivo, correcciones y avisos de cierre/finalistas; el portal es opcional. El cierre nunca significa venta adjudicada.

## Registro y consentimiento
Número validado; categorías y zonas confirmadas; consentimiento para recibir oportunidades; opción de baja y límites de frecuencia. Cumplir políticas aplicables de WhatsApp, protección de datos y condiciones de Whapi. Whapi utiliza conexión de dispositivo vinculado: prever bloqueo/desconexión y alternativa de transporte.

## Conversación
Invitado → interesado → borrador → esperando confirmación → cotizado → revisión opcional → cierre → adjudicado/no adjudicado. Estados alternativos: rechazo, aclaración, caducado, baja, error.

## Ejemplos
- «Sí, cotizo» → entregar listado.
- PDF/Excel/foto/texto → interpretar y pedir confirmar.
- «Cambiá la pintura a $X» → identificar línea/unidad, mostrar modificación y pedir confirmar.
- «¿Cómo va?» → estado y cobertura; no inventar puesto o filtrar ofertas.
- «No trabajo esto» → sugerir ajuste de catálogo y confirmar.
- «BAJA» → dejar de invitar y registrar baja.

## Seguridad y robustez
Validar autenticidad webhook según posibilidades reales del proveedor; deduplicar por canal+ID externo. Persistir entrada antes de procesar. No duplicar envíos; colas y backoff; estado de entregado distinto de «encolado». Validar archivos y tamaño. No permitir que mensajes ejecuten órdenes administrativas.

## Comunicación
Invitación pertinente, recordatorio neutral cercano al vencimiento cuando proceda, aviso de resultado. No presionar para bajar precios ni exponer datos ajenos. Controlar costos por cliente.

## D013 — envío selectivo automático
Al enviar la lista, el comprador autoriza el contacto automático. Una sola solicitud idempotente por proveedor y ronda, con únicamente los materiales concretos que confirmó trabajar y que puede entregar en la zona, sin difundir archivo original completo. Respetar opt-in, exclusiones, baja, límite de frecuencia y costos; producto con duda queda retenido, el resto avanza. La confirmación del proveedor para precios y cambios sigue siendo obligatoria.

## D028 — Baja por WhatsApp sin fricción y buzón durable (propuesta en código)
Un proveedor que escriba **BAJA** debe quedar desuscripto sin ir al portal ni tener una ronda activa; las invitaciones futuras quedan bloqueadas. Debe registrarse en una base privada sin almacenar teléfono ni texto en claro. Se exige asociación segura del chat con proveedor, reintentos idempotentes, consentimiento comprobable y respuestas de estado honestas. El módulo D028 todavía está probado solo en CI sintética, **no en Whapi real**. Ver [docs/92](92-whapi-buzon-privado-y-baja.md).
