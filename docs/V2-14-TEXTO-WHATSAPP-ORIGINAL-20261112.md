# Cotironda V2-14 — respuestas de texto por WhatsApp en el portal

**Fecha:** 12/11/2026. **Estado:** desarrollo NO desplegado. Base PR #834, SHA `ef4d9d8b7f3f4c47b7738dd9df25a1ac1b45bc4b`.

## Problema observado

El piloto recibió textos cifrados de proveedores, pero la consulta V2 de respondedores y la descarga de originales sólo aceptaban PDFs/Excel/Word/imágenes. En Supabase PILOTO se comprobó (agregado, sin descifrar fuente) **1 enlace a una respuesta textual**, `semantic_unique_mvp291`, con el SHA original coincidente y sobre AES-GCM verosímil. **Este mensaje histórico NO es automáticamente visible:** no existen buyer Auth, consentimiento prospectivo V2 ni una política de originales habilitada, y la política exige nueva ronda posterior a la activación.

El portal debe reconocer presupuestos respondidos **directamente por mensaje** sin obligar al proveedor a adjuntar un archivo o crear uno falso.

## Implementación propuesta en esta rama

- El catálogo privado V2 agrega `kind='text'`, tipo `text/plain` y etiqueta `WhatsApp (texto)` cuando:
  - la fuente está vinculada al mismo proveedor/ronda por `ai_supplier_links_mvp225`, recibida durante plazo, posterior a despacho aceptado, con consentimiento V2 previo;
  - el SHA del texto guardado en `whapi_inbox` coincide exactamente con `link.source_sha256`;
  - el mensaje está cifrado y en `needs_review`;
  - el vínculo fue `quoted_whapi_id` o `single_active_round`, o `semantic_unique_mvp291` **con decisión persistida `linked`, SHA, proveedor y request exactos**. No se acepta similitud semántica informal, ofertas de otra ronda ni un enlace suelto.
- La función SQL `cotironda_piloto_v2_original_source_private` devuelve al **servidor** un sobre cifrado `authorized_text_v2` (nonce, ciphertext, chatHmac/messageHmac y SHA), sólo después de la autorización completa del catálogo V2. **Ni el catálogo ni el navegador reciben esos campos.**
- Nueva `cotironda_piloto_v2_record_text_download` exclusiva de `service_role` registra auditoría de archivo textual junto al resto de descargas, tras revalidar sesión, proveedor, SHA y consentimiento. La propia función nunca descifra.
- `src/server/v2-14-texto-whatsapp-cifrado.ts` usa **AES-256-GCM con la AAD exacta del Whapi v76** (`chatHmac|messageHmac|text`), rechaza clave/nonce/tag/tamaño/formato incorrecto, verifica SHA-256 de los bytes UTF-8 originales y **no normaliza el texto ni inventa precios/IVA/flete**.
- El endpoint privado de descarga entrega un `.txt` con bytes exactos, `no-store`, doble comprobación Auth+fuente antes/después de I/O y auditoría obligatoria antes de enviar bytes. La versión de papel/fuente del proveedor permanece inalterada.
- El análisis individual V2 acepta el texto autenticado de 40–4.000 bytes después del mismo claim idempotente SQL, máximo tres intentos. Si un mensaje corto/dañado no alcanza la evidencia mínima, el original continúa disponible y la guía permanece pendiente.
- No se cambió el webhook WhatsApp vivo ni el código de correlación MVP291/MVP292. No se envían mensajes ni se actualizan los precios.

## Variables y seguridad de instalación futura

**Nueva dependencia de configuración obligatoria sólo en el servidor Node Preview:** `COTIRONDA_PILOT_AES_HEX` (clave de 32 bytes hex idéntica a la que usa exclusivamente el webhook Supabase PILOTO para cifrar la fuente original). **Nunca** crear `NEXT_PUBLIC_COTIRONDA_PILOT_AES_HEX`, insertar clave en GitHub, un Issue, chat, logs o mensajes. No hace falta mover la clave a clientes; el backend Vercel debe obtenerla del gestor seguro, con accesos delimitados al proyecto de prueba. Si no está configurada, falla cerrado.

Verificación futura antes de publicar: analizar el impacto de duplicar un secreto de descifrado fuera de Supabase y evaluar si conviene canalizar exclusivamente por Edge privada para reducir su superficie. **No activar sin auditoría de secretos**, aunque CI sea verde.

Todas las rutas conservan gates `preview`, SHA de release, Auth SMS, usuario/empresa Whapi, consentimiento por proveedor prospectivo, policy OFF y RPCs `service_role`. No usar `main` como código de portal: carece de `apps/portal`.

## Criterios y pruebas

- [x] Diseño en rama: catálogo textual, RPC de sobre, descarga, auditoría, guía individual y adapter AES-GCM server-only.
- [x] Tests unitarios añadidos: bytes originales idénticos, AES/GCM/AAD/SHA adulterados, buyer Auth, descarga auditada, revocación y análisis de fuente.
- [x] Fixture PostgreSQL 17 añadido: texto con mensaje citado y correlación MVP291 probada, correlación sin evidencia rechazada, no exposición de sobre en listado, deny por revocación, no acceso anónimo, audit de fuente y claim de guía.
- [ ] CI del SHA final completa y corregida.
- [ ] Preflight de secretos + publicación Preview PILOTO autorizada con `Publicalo`.
- [ ] Dos respuestas reales en WhatsApp (texto + documento), conexión comprador Auth SMS, aparición en catálogo con guía, descarga byte a byte y cierre. **No hay prueba E2E hoy.**

## Límites

No convertir texto de WhatsApp de un proveedor en «presupuesto verificado comercialmente» por la mera existencia del mensaje. La visualización del **original** y la guía individual son distintas de comparación y adjudicación. La ausencia de IVA/flete significa «no informado», nunca incluido/gratis. No se permite descifrar presupuestos históricos sin condiciones prospectivas V2.
