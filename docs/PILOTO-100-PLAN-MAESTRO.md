# Cotironda V2 — Plan maestro operativo, piloto 100 %

**Regla:** completar solo el circuito comercial, no generar otro roadmap ni PR redundantes. El [Estado actual](PILOTO-100-ESTADO.md) contiene **UN** bloqueo próximo y datos verificables. [Contrato V2](COTIRONDA-V2-CONTRATO.md) es la fuente de reglas, [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) coordina el avance.

**Relevo verificado 14/11 06:30 ART:** Vercel Preview SHA f985 respondió HTTP 402 cuota diaria; NO publicada. Mantener reintento único 17:07 ART, no otro proyecto ni gastos. Cron histórico cerró la última ronda `prepared` a las 06:25 ART: 7 rondas = 5 cerradas, 2 borradores, cero preparadas. WhatsApp histórico sin nuevos mensajes enviados; 0 finales/revelaciones por outbox. Comprador y dos proveedores en WhatsApp; 106 líneas de catálogo, 86 curadas, 20 pendientes, 0 catálogos con confirmación registrada. Variable privada de Supabase ahora presente en Vercel Preview (tipo Sensitive); valor/autenticación NO verificados todavía. Mantener todas las políticas V2 OFF.

- [x] **Cierre V1 aislado del piloto V2:** migración Supabase PILOTO `20261114093622` detuvo **solo job1** de `cotironda_piloto_close_due_5min`, no lo borró y dejó jobs3/4 activos. Prueba PostgreSQL 17 con rollback real y poscontrol: 7 rondas conservadas (5 cerradas, 2 borradores), negocio/originales/cierre/términos OFF, 0 consentimientos. [Acta](PILOTO-V2-CRON-V1-SUSPENDIDO-20261114.md), [PR #852](https://github.com/ProtectorRudo/Cotironda/pull/852). No encender cron antiguo para cerrar V2.

**Control 14/11 ~07:16 ART:** intervención del titular completada y presencia de secret verificada en Vercel. Continuar en Bloqueo 2, único reintento f985; NO intentar saltar cuota ni generar otra credencial.

- [x] **Diagnóstico P0 D016 solo lectura:** preflight SQL real confirmó 5 RPC instaladas, calendario La Plata 2026 aprobado, comprador verificado 1, 0 consentimientos de originales, políticas OFF. No volver a crear RPC ya existentes.
- [ ] **Publicación real del puente D016 WhatsApp:** infraestructura reproducible lista en [PR #853](https://github.com/ProtectorRudo/Cotironda/pull/853): **59/61 módulos LIVE v76 idénticos**, 2 parches exactos, generador D016 de 63 rutas, **Deno-check real SUCCESS** en GitHub run [43588912163](https://github.com/ProtectorRudo/Cotironda/actions/runs/43588912163) y 7/7 workflows de commit `c75b82ce...`. **No desplegar aún:** antes falta Preview f985 READY, misma HMAC en Edge mediante secretos seguros, pruebas funcionales de sesiones/deduplicación y consentimiento prospectivo válido para compartir originales; Edge real permanece v76. No abrir PR duplicados ni activar flags.

**Evidencia CI del puente v76:** [PR #853](https://github.com/ProtectorRudo/Cotironda/pull/853), fuente comprobada commit `c75b82cebc5716fcda225b68d991799cc794dfa1`: **7/7 workflows SUCCESS**, incluidos reconstrucción v76 real 61/61 y Deno-check candidato D016 63 archivos. No hay despliegue real del webhook ni autorización para compartir originales; sigue prioritario el Preview f985 y el E2E.

- [x] **Integración D016 compilada con el LIVE v76:** 61 fuentes exactas (59 originales GitHub sin cambios y 2 reconstruidas por parche verificado) más 2 módulos nuevos, **63 dependencias resueltas y Deno-check SUCCESS** con checkout de GitHub Actions aislado. No equivale a sesión WhatsApp/portal real ni a publicación de Edge.
- [x] **Texto de alta de proveedor D016 preparado, NO aprobado:** [borrador en PR #846](https://github.com/ProtectorRudo/Cotironda/blob/feat/d016-alta-unica-consentimiento-originales-20261113/docs/PILOTO-D016-TEXTO-ALTA-ORIGINALES-BORRADOR-20261114.md). Contiene información al proveedor, aceptación exacta única y revocación. **Bloqueo real antes de enviar:** completar responsable legal, domicilio, canal de privacidad y retención, revisión de terceros/datos personales y aprobación del texto íntegro versionado; **cero avisos y consentimientos reales**.

## Checklist de desbloqueo (en orden)

- [x] **Dirección V2 decidida y documentada:** por catálogo y zona, original fiel, proveedor identificado al responder, guía individual, cierre 2 días hábiles e informe general. No rankings/ganadores automáticos V1.
- [x] **Infraestructura privada V2 parcial:** Supabase PILOTO tiene migraciones y protecciones D016, todos los interruptores comerciales OFF; 7 rondas antiguas conservadas (5 cerradas, 2 borradores; 0 preparadas al 14/11 06:30 ART).
- [x] **HMAC para enlace privado D016:** generada y guardada cifrada SOLO en Vercel Preview `cotironda-portal-dev`, variable `COTIRONDA_D016_HMAC_KEY_HEX`. Nunca divulgar ni regenerar accidentalmente.
- [x] **BLOQUEO 1 — presencia de la variable privada de Supabase:** Vercel `cotironda-portal-dev` confirma `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`, tipo **Sensitive**, target **Preview** general y sin restricción de rama; no Production. Se comprobó su presencia SIN leer contenido. **Pendiente comprobar valor y autenticación real solo mediante prueba desde el servidor tras desplegar f985**.
- [ ] **BLOQUEO 2 — Preview aprobada:** verificar el reintento YA existente (14/11/2026 17:07 ART), proyecto correcto, SHA exacto `f98527c9516478783bd7cf95433c58f5ca445937` de [#837](https://github.com/ProtectorRudo/Cotironda/pull/837), READY, SSO protegido. No duplicar deployment ni usar proyecto alternativo. Corregir `COTIRONDA_D016_PORTAL_ORIGIN` solo con URL realmente verificada y activación autorizada.
- [ ] **BLOQUEO 3 — puente WhatsApp real:** cotejar Edge Whapi **v76** con el overlay candidato D016, incluir misma clave HMAC mediante gestor seguro, usar autenticación real y referencias de ronda; probar casos normales, fallos, reintentos y duplicados; publicar SOLO tras revisión y autorización comercial. No SMS, ni confirmaciones por cada oferta.
- [ ] **BLOQUEO 4 — documentos/consentimientos:** aprobar texto único de términos V2 (revisión legal) y recabar aceptación REAL prospectiva al alta para revelar originales. No suponer consentimiento por cotizar. Verificar lectura original intacta, proveedor correcto, descarga privada, análisis individual aunque el parser no logre explicar el PDF.
- [ ] **BLOQUEO 5 — prueba E2E comercial:** comprador manda pedido nuevo por WhatsApp; IA identifica productos/catálogos, dos proveedores consentidos contestan en formatos distintos; comprador ve únicamente respondieron y descarga originales; recibe análisis por oferta y cierre con informe 2 días hábiles. Probar con permiso, sin alterar rondas históricas.
- [ ] **BLOQUEO 6 — decisión de salida piloto:** una vez probado todo, habilitar SOLO las políticas autorizadas en PILOTO y monitorear entregas, costes, errores, duplicados y permisos. Producción requiere autorización aparte.

## Criterios mínimos de aceptación

- Comprador sin SMS, sin contraseña/manualidades, sesión validada servidor; aislamiento real entre empresas y rondas.
- Envío dirigido por **producto**, unidades y equivalencias correctas; ningún negocio invitado solo por pertenecer al rubro. Varias rondas simultáneas por proveedor sin confundir cotizaciones.
- Original exacto (SHA/contenido) vinculado con evidencia; mensajes ambiguos se retienen internamente. Mostrar solo negocios que respondieron, sin listar no respondieron.
- No IVA/flete/descuentos inventados; análisis útil, claro y sin falsos rankings.
- Consentimiento informado y revocable para originales, sin permisos retroactivos, links temporales privados y logs sin datos sensibles.
- Dos respuestas reales, originales verificables, análisis y cierre accesibles al comprador por navegador. Sin trabajo manual de operadores ni reenvíos innecesarios.

## Método de trabajo y entrega

Cada acción: **verificar estado actual → causa raíz → cambio mínimo en rama → pruebas proporcionadas → comprobar resultado en el entorno correcto → registrar**. No hacer una segunda PR para resolver lo que ya cubre una activa. Reportar HECHO/PROBADO/PENDIENTE, commit/PR y enlace real. Los PR draft no son código instalado.

**Historial completo anterior:** [Plan previo a compactación](https://github.com/ProtectorRudo/Cotironda/blob/7ea6863deb38415a518d5c80788d5210a9fca75e/docs/PILOTO-100-PLAN-MAESTRO.md). Git conserva esa versión íntegra, otras decisiones y auditorías; no volver a copiar la bitácora aquí.
