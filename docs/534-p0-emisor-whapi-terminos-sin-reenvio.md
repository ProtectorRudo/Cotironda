# Acta 534 — P0 · Emisor Whapi seguro para condiciones de alta (solo desarrollo)

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registra en nuestro checklist y plan maestro». **Sin despliegue, sin enviar mensajes, sin modificar Supabase PILOTO, sin activar Auth ni políticas.**

## Decisión: reutilizar transporte existente, no construir otro WhatsApp

Se leyó el código existente de `src/server/whapi-cloud-transport-d055.ts`, `whapi-invitation-sender-d070.ts`, `whapi-send-worker-d054.ts`, `whapi-supplier-self-enroll-d072.ts`, `whapi-crypto-broker.ts`, el envío vigente de documentos en Edge `cotironda-piloto-document-recovery/whapi-dispatch.ts`, el SQL M362/M364/M365 y el borrador de condiciones. El D055 proporciona validación de respuesta Whapi, destinatario permitido, identidad de chat, límites de bytes y tratamiento de HTTP incierto. El envío vigente de PDFs del PILOTO es un camino **diferente**; no se tocó ni duplicó.

**Nueva pieza:** `src/server/whapi-terms-onboarding-p0.ts`. No contiene endpoint ni cron, no usa `fetch` global, secretos de entorno, credenciales embebidas ni destinatarios reales; se activa únicamente mediante puertos de servidor expresamente inyectados y dos flags booleanos.

Secuencia por un único aviso:

1. Obtiene **un** claim preparado por el futuro backend confiable, con `jobId`, `leaseToken`, proveedor, chat HMAC, versión, SHA256 y texto exacto.
2. Verifica que el **texto completo** tenga el SHA registrado, incluya la versión `cotironda-originales-alta-v1` y entre en el límite seguro del transporte (200–1.500 caracteres). **Nunca truncar términos** ni enviar un resumen haciéndolo pasar por condiciones completas.
3. Resuelve el destinatario únicamente desde el canal verificado de proveedor; coteja HMAC exacto de destinatario y allowlist. No acepta teléfono de un mensaje de IA ni un cliente.
4. Exige `beginCommitted` antes del primer HTTP y `authorizeCommitted` inmediatamente antes de enviar, para verificar política activada, permiso/BAJA, identidad y cupo. Si falta COMMIT o su respuesta es incierta, **no envía**.
5. Reutiliza `crearTransporteWhapiCloudD055`; exige respuesta `sent:true`, ID, estado y chat correctos. Un `pending` indica **aceptación de API** y nunca entrega/leído.
6. Calcula el HMAC de ID Whapi con el **mismo contrato de identidad D029/D072** y entrega al backend de persistencia la huella del contenido y el resultado `api_accepted` o `uncertain`. Ante timeout, 401, 429, respuesta malformada o pérdida del COMMIT, **no reenvía automáticamente**.
7. No inserta ningún consentimiento ni revocación; la aceptación entrante, revisión MFA y registro de episodios M365 permanecen una etapa independiente.

**Limitación importante:** `claim`, `beginCommitted`, `authorizeCommitted`, `finishCommitted` y resolución cifrada del destinatario están definidos como **puertos obligatorios**, pero **todavía falta implementar y conectar su adaptador SQL/servidor real al PILOTO**. No convertir un stub de CI en comprobante auténtico. La escritura de `supplier_original_terms_notices_mvp364` deberá ser transaccional, solo desde el resultado Whapi confirmado por el servidor, y no una inserción arbitraria con una cadena `api_accepted`.

## Criterios y pruebas

- [x] Reutilización D055; sin segundo transporte/HTTP, sin enviar mensajes.
- [x] OFF por defecto, dos flags, entrega sólo a lista permitida, sin números ni tokens en el resultado.
- [x] SHA de texto exacto y versión correctos, canal/chat HMAC, lease y BEGIN previos.
- [x] Test Node agregado: OFF, texto modificado/hash falso, chat cambiado, destino no permitido, BEGIN fallido, guardia revocada, timeout, JSON malformado, chat Whapi cruzado, falla de persistencia e identificador HMAC; ningún reenvío.
- [ ] Confirmar CI último SHA del PR técnico.
- [ ] **Siguiente paso concreto:** implementar en backend confiable `claim / begin / authorize / finish` con transacciones y unicidad real, referenciando M364 y el operador Auth AAL2; no exponer un RPC que permita falsificar el acuse. Probar con PostgreSQL 17 y con adaptación HTTP sin enviar.
- [ ] Aprobar jurídicamente/comercialmente el **texto exacto** que se enviará. El borrador supera el alcance de un aviso breve y no se debe truncar; decidir condiciones WhatsApp concisas o documento/URL verificable, **sin dar permisos por silencio**.
- [ ] Operador humano MFA, aceptación explícita del proveedor, comprador OTP y E2E con dos originales de una ronda. **P0–P5 ABIERTOS**.

## Política de continuidad y producto

**No agregar nuevas reglas al ledger M362–M365 por especulación.** El bloqueo pasa a ser operativo: un **envío real con comprobante**, seguido de una **aceptación real revisada por operador AAL2**, habilitados solo con aprobación de términos y `Publicalo en cotironda-piloto`. Luego pasar inmediatamente al comprador Auth y a la prueba WhatsApp→2 documentos→seguimiento→cierre. El parser y ranking económico no deben impedir mostrar el estado de recepción.

Fuentes: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [Acta 533](533-mvp365-reaceptacion-prospectiva-episodios.md).
