# 187 — MVP-067: URL de Whapi alineada al endpoint REAL y preparación del ensayo 1+2

**01/11/2026 · Issue #347 · Preparación técnica, sin mensajes reales ni despliegue.**

## Error de integración encontrado y corregido

La auditoría antigua MVP-041 validaba y proponía `/api/whapi/webhook` como destino de Whapi, pero la única ruta real de Next.js está en `apps/portal/app/api/integraciones/whapi/route.ts`, es decir:

`https://<origen-HTTPS-Preview-verificado>/api/integraciones/whapi`

El preflight ahora acepta **solo esa ruta**, rechaza URL heredada, consultas, contraseña en URL, HTTP o el propio gate.whapi.cloud. El archivo `scripts/ops/auditar-canal-whapi-mvp041.mjs` ahora lee el mismo nombre de variable secreta que el receptor D083: `COTIRONDA_WHAPI_WEBHOOK_SECRET` (hexadecimal de 64 caracteres), antes estaba desalineado con `...SECRET_HEX`. La auditoría NO altera configuraciones; hace solo tres GET bajo autorización explícita y no imprime ningún dato sensible.

**Importante:** Esto NO implica que la URL exista en el despliegue actual ni que deba cargarse en Whapi. La Preview debe corresponder a un commit que contenga D083, driver D088, el gate de ambos roles MVP-066 y SQL D074/D028 instalado en una base de piloto recuperable. El webhook no debe recibir eventos hasta persistir cada mensaje con ACK honesto.

## Ensayo controlado: tres líneas del propietario

- **Arquitecto A**: número propio validado, vinculado a una organización compradora propia y consentimiento de distribución/contacto. Envía lista de materiales y zona de entrega al número de Cotironda.
- **Corralón B y Corralón C**: cada número propio validado y vinculado a una empresa proveedora distinta, con catálogo activo de cemento, zona cubierta y consentimiento. Solo se invita a quienes venden la familia canónica y atienden la zona. No hay invitaciones a terceros.
- **Presupuestos:** B y C envían respuestas WhatsApp; Cotironda las vincula a la ronda correcta (si hay ambigüedad de múltiples rondas, BLOQUEAR y aclarar la referencia), conserva texto íntegro cifrado y todos los renglones/precios/total originales como versiones, sin exigir segundo Confirmo.
- **Vista y cierre:** ofertantes anónimos y comparación separada por cobertura, cantidad, IVA, flete y cargos extras; hasta dos finalistas por rubro comparable al vencimiento, contactos revelados recíprocamente solo con consentimiento verificado y registro auditable. No adjudicar ni revelar perdedores.

## Orden correcto para solicitar los números de prueba

1. Preparar entorno de pruebas recuperable y auditar instalación de SQL D024–D093; no instalar en DEV histórica sin backup auténtico + restore #175. No crear otro proyecto con costos sin confirmación.
2. Conseguir Preview desplegada en URL HTTPS verificada para el portal Next, sin gate de autenticación que bloquee a Whapi; dejar portal protegido y aislar SOLO POST webhook con secreto largo, sin exponer service_role.
3. Configurar canal en Whapi **Body + messages.post** con header `X-Cotironda-Webhook-Key` igual al secreto privado del backend. En esta etapa, no pedir token por chat ni incluirlo en URL. `statuses.post` es opcional: el receptor lo ignora.
4. Implementar alta verificada de un comprador y dos negocios, identidad HMAC y consentimiento, allowlist de **tres números** (guardados cifrados en backend). Realizar prueba de webhook sin emisor primero y validar roles/no duplicados.
5. **Recién entonces solicitar los tres números** por un mecanismo seguro de onboarding; no compartir teléfonos o tokens en Issues/PR/logs. Dar de alta desde cada teléfono mediante mensaje voluntario y verificar control de la línea.
6. Habilitar invitaciones solo a los dos corralones de ensayo, con cupo 2 y revalidación antes de HTTP; prueba completa y luego desactivar el modo piloto por defecto.

### Estado leído el 01/11

Cotironda DEV PG17.11 está activa y registra 17 migraciones históricas, pero **no existen** tablas `rounds_v1`, `whapi_buyer_contacts_d074`, `whapi_contacts_v1` ni `whapi_original_bindings_d093`. No se aplicó ninguna migración. La Preview Vercel de `cotironda-portal-dev` READY estaba en SHA `29f36d5`, anterior a D083/MVP066. Por ello **no hay URL de webhook live autenticada para configurar**, ni se debe pedir todavía los números.

## Calidad y prohibiciones

Pruebas unitarias MVP-041 extendidas con ruta obsoleta, sin llamadas de red en rutas inválidas, secreto no expuesto, solo GET; seguir CI de PostgreSQL/Node/Next. No enviar WhatsApp, no grabar teléfonos ni secretos, no cambiar Whapi, Vercel, Supabase, DNS, main o producción por esta corrección. Gate #175 sigue abierto.
