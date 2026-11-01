# 160 — MVP-040: entrada WhatsApp del arquitecto hacia la ronda comercial

**31/10/2026 · Issue #293 · solo desarrollo y CI, NO Whapi real.**

## Objetivo comercial aprobado

El arquitecto envía un documento o texto por WhatsApp. Cotironda identifica materiales y zona, y prepara automáticamente invitaciones para cualquier negocio habilitado del rubro con catálogo/entrega compatibles. Proveedores responden por WhatsApp; sus ofertas se registran y el ranking se calcula por cobertura y condiciones comparables. El portal queda opcional. Al cierre se identifican hasta dos finalistas por rubro y las partes consentidas se contactan directamente, **sin adjudicación ni compra en Cotironda** (UX-002, docs/159).

## Primer tramo técnico integrado en este PR

Nuevo consumidor privado `src/server/buyer-whatsapp-ingress-d073.ts`:
1. Toma **solo IDs HMAC** `channel+messageKey` de un mensaje previamente persistido, autenticado, cifrado y vinculado en backend con una empresa compradora. No recibe teléfono, chat crudo, nombre ni texto directo de un endpoint público. El puerto privado `cargar` revalida procedencia, membresía y autorización. **A diferencia del proveedor D027, hoy ese puerto de comprador NO está conectado a PostgreSQL DEV**.
2. Solo usa contenido de mensaje ya descifrado/verificado y `prepararPedidoTextoMvp028` con un diccionario curado (primer subconjunto, no un modelo de IA). Un PDF/imagen/audio NO se considera leído por una URL o leyenda de Whapi: requiere descarga privada, antivirus, extracción y marcado `medioEscaneadoYExtraido:true` por un worker confiable; de lo contrario queda `esperando_extraccion_segura`.
3. Si **solo** falta zona y el pedido es reconocible, invoca `registrarFaltaZona` para guardar **atómicamente** texto, chat, empresa, ID original y **una** intención de pregunta en el outbox: «¿En qué localidad se entregan los materiales?». La pregunta no se envía en esta función. Cuando llega una localidad en mensaje nuevo del **mismo chat validado**, se utiliza la lista original: no hay que copiarla.
4. Si existe consentimiento previo del comprador para compartir contacto al quedar finalista, zona válida y artículos seguros, invoca `crearRonda` en transacción privada **idempotente por solicitud original+canal+empresa**. El contrato usa los campos D064 (sin suponer sesión web/portal), vinculando buyerOrgId con cuenta real desde backend. El comando debe confirmar COMMIT antes de seguir.
5. Después del commit llama `prepararInvitaciones` (port al planificador D071) que elige comercios elegibles en PostgreSQL por producto/rubro/zona/opt-in y **prepara** las invitaciones idempotentes. **No invoca** D070 sender ni D055 transporte. Si esta preparación falla después de guardar la ronda, deja estado `ronda_registrada_preparacion_pendiente`, sin anunciar envío. Retransmitir requiere que D064/D071 mantengan sus garantías de idempotencia en PostgreSQL.

La respuesta al caller es solo código de estado y eventualmente UUID de ronda; nunca número, nombre, contenido de presupuesto, token ni texto. No hay un nuevo endpoint público, ni secrets, DNS, costos IA o actividad en Whapi. No se aceptan ofertas de WhatsApp de comprador como cotizaciones de proveedor.

## Lo que tenemos reutilizable, sin duplicar infraestructura

- Entrada de proveedores D027+D028/D029, almacenamiento de mensajes cifrados en diseño SQL privado, cola D062 y registro de precios D061/D060.
- Matching de proveedores e invitaciones D065/D071/D070, transporte D055 cerrado y protegido.
- Comparación justa D022 y finalistas anónimos MVP-039. NO existe aún worker de cierre **por rubro** que lea ofertas reales y notifique finalistas; no confundir piezas de CI con E2E comercial real.

## Riesgos y pasos verificables para piloto

**Aún no hay WhatsApp real:** falta puerto privado para compradores con identidad por chat, persistencia de consulta por zona y outbox de preguntas; descarga/antivirus + IA documental para PDF/Excel/Word/fotos; gateway SQL de creación y D071 aplicado en Supabase DEV; número Whapi configurado con webhook/headers válidos, allowlist/consentimientos; worker de recepción de cotizaciones con IA y ranking real por rubro al cierre. Implementación no debe saltar permisos, consentimiento recíproco ni secret management.

**Prioridad inmediata:** 1) respaldo y restore auténtico de DEV #175, 2) instalar y probar componentes comerciales con flags OFF, 3) conectar un chat comprador y dos proveedores autorizados y simular con textos reales SIN enviar a terceros; 4) habilitar envío SOLO en entorno/piloto explícitamente autorizado y auditar entrega, deduplicación, ranking y costos. La ruta de envío o el dominio no se habilitan aquí.

**Pruebas:** `tests/unit/mvp040-buyer-whatsapp-bridge.test.mjs` abarca misma lista por WhatsApp, zona faltante, nuevo mensaje de zona sin copiar pedido, duplicado sin segunda pregunta, media aún no verificada, media validada, consentimiento, falso remitente/canal, producto desconocido, caída pos-commit y reintento, no elegibles, flags OFF y prohibición de afirmar mensajes enviados.
