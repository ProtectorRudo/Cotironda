# Decisión 377 — MVP253: consentimiento específico, cuota mensual y procedencia OCR

Fecha: 06/11/2026. Etapa IA Central 3. **Código solamente en desarrollo. No desplegar en PILOTO, no activar Google Cloud Vision ni enviar WhatsApps.**

## Decisión y riesgo

MVP252 permitió auditar fotografías y escaneos en recuperación privada sin publicar cifras, pero su tercera puerta SQL todavía no existía. Esta entrega añade esa puerta, un presupuesto de consumo y un libro de procedencia privado, sin alterar las reglas MVP106/107 de publicación de ofertas.

El consentimiento genérico de WhatsApp o el registro de usuarios en Cotironda **NO** equivale a consentimiento para transferir el documento original a Google Cloud Vision. Se requieren opt-ins específicos, vigentes y comprobables, del **comprador y del proveedor**. La autorización del titular de Cotironda permite desarrollar y probar, pero no crea consentimientos de terceros.

## Contrato implementado

- `supabase/piloto/mvp253_visual_ocr_policy_provenance.sql`: contiene `visual_ocr_control_mvp253`, `visual_ocr_consent_mvp253` y `visual_ocr_attempt_mvp253` en esquema privado, con RLS activado y sin permisos directos de `anon`, `authenticated` ni `service_role`.
- Toda política inicia con **enabled=false, cuota mensual 0 páginas y presupuesto 0 microdólares**. No se insertan consentimientos ni se configuran secretos mediante esta migración.
- `cotironda_piloto_visual_ocr_permission_mvp252(text,text)` solo está autorizada para `service_role`. En una transacción serializa las reservas mediante bloqueo del registro único de política. Verifica SHA de fuente, MIME, tamaño, ronda vigente, invitación preparada, vínculo exacto entre archivo, proveedor y comprador, consentimiento general y nuevo consentimiento externo de **ambos**, doble lectura coincidente y conciliación económica. Reserva un token UUID único por original.
- Reservas de costo conservadoras: **1 unidad por imagen, 5 unidades por PDF** (máximo de páginas por solicitud), sin reintentar automáticamente una solicitud que quizá haya sido facturada. Una solicitud con el mismo HMAC nunca genera segunda reserva, aunque la primera haya fallado. El monto se registra en micro-USD: valor inicial de estimación 1.500 micro-USD/página (US$0,0015). **No sustituye la facturación o límites de Google Cloud; el operador debe configurar alertas y topes externos.** [Precio oficial de Cloud Vision](https://cloud.google.com/vision/pricing).
- `cotironda_piloto_visual_ocr_finish_mvp253` requiere SHA, token de reserva, estado, motivo validado, cantidad de páginas y evidencia de confianza. Al finalizar persiste **solo el SHA-256 del texto OCR y confianza mínima**; nunca guarda ese texto, cifras, nombre del proveedor o imagen en el registro adicional. Una revocación de consentimiento entre reserva y resultado transforma cualquier conclusión positiva en revisión privada.
- `private-document-recovery.ts` llama a la reserva antes de OCR y a `finish` después. Si falla el guardado privado, exige conciliación; no publica presupuestos ni reintenta el OCR automáticamente.
- `supplier-visual-ocr-audit-mvp252.ts` devuelve digest SHA-256 de la transcripción OCR y confianza mínima solo cuando está completamente cotejada con el original.

## Control de privacidad

No se cambió el webhook de WhatsApp; la OCR se ejecutaría solamente en la ruta privada de recuperación, después de analizar documentos, y solo cuando estén habilitados **los flags previos MÁS la política de base y ambos consentimientos**.

El resultado `covered_private` acredita una lectura OCR preliminar pero **no** permite `source_text_covered`, publicar ofertas, adjudicar proveedores, comparar precios ni revelar contactos. Las funciones SQL MVP106 y MVP107 permanecen como estaban.

No existe interfaz pública para conceder opt-ins: una persona autorizada debe conservar primero el consentimiento explícito verificable y cargar manualmente la huella de su evidencia. El operador debe comprobar condiciones de tratamiento y almacenamiento de datos con Cloud Vision antes de habilitar. Esta entrega no lo hace automáticamente.

## Criterios de aceptación

- Suites PostgreSQL **17** reales con `ROLLBACK`: política OFF por defecto, consentimiento de las dos partes, SHA distinto, proveedor/empresa ajenos, invitación vigente, un solo lease por archivo, conteo conservador de páginas y micro-USD, bloqueo por cuota, finalización idempotente, bloqueo por token ajeno, confianza insuficiente, revocación posterior y RLS/ACL.
- Regresión Node de autorización denegada: ningún byte se envía; autorización con mock OCR: registro privado de huella y confianza, sin publicación; fallo del registro: revisión obligatoria.
- CI general, Edge Deno, Next.js y PostgreSQL sin regresiones.
- No se prueba contra Google real; no se activa la integración en Supabase; no se guardan credenciales.

## Pendientes para operación real

1. Confirmar los consentimientos específicos reales de los participantes y el acuerdo de tratamiento de datos; conservar evidencia privada, no volcarla en GitHub.
2. Configurar cuenta de servicio de Google Cloud Vision con permisos mínimos, alertas de gasto, cuota externa y presupuesto mensual acorde al modelo comercial.
3. Publicar **solo en el PILOTO con autorización de despliegue** las migraciones y funciones probadas, registrando versión y rollback.
4. Probar documentos visuales auténticos con OCR real, cotejar renglones/IVA/flete, medir falsos positivos/omisiones y documentar costos por cliente.
5. Diseñar, auditar y verificar una eventual promoción a ofertas privadas; **no abrirla** con estos cambios.

No declarar etapa 3 terminada ni considerar el resultado sintético E2E real.
