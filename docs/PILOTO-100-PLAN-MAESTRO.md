# Cotironda V2 — Plan maestro operativo, piloto 100 %

**Regla:** completar solo el circuito comercial, no generar otro roadmap ni PR redundantes. El [Estado actual](PILOTO-100-ESTADO.md) contiene **UN** bloqueo próximo y datos verificables. [Contrato V2](COTIRONDA-V2-CONTRATO.md) es la fuente de reglas, [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) coordina el avance.

**Relevo verificado 14/11 06:30 ART:** Vercel Preview SHA f985 respondió HTTP 402 cuota diaria; NO publicada. Mantener reintento único 17:07 ART, no otro proyecto ni gastos. Cron histórico cerró la última ronda `prepared` a las 06:25 ART: 7 rondas = 5 cerradas, 2 borradores, cero preparadas. WhatsApp histórico sin nuevos mensajes enviados; 0 finales/revelaciones por outbox. Comprador y dos proveedores en WhatsApp; 106 líneas de catálogo, 86 curadas, 20 pendientes, 0 catálogos con confirmación registrada. Clave `sb_secret_` de Supabase sigue faltando y requiere panel privado, no simularla. Mantener todas las políticas V2 OFF.

## Checklist de desbloqueo (en orden)

- [x] **Dirección V2 decidida y documentada:** por catálogo y zona, original fiel, proveedor identificado al responder, guía individual, cierre 2 días hábiles e informe general. No rankings/ganadores automáticos V1.
- [x] **Infraestructura privada V2 parcial:** Supabase PILOTO tiene migraciones y protecciones D016, todos los interruptores comerciales OFF; 7 rondas antiguas conservadas (5 cerradas, 2 borradores; 0 preparadas al 14/11 06:30 ART).
- [x] **HMAC para enlace privado D016:** generada y guardada cifrada SOLO en Vercel Preview `cotironda-portal-dev`, variable `COTIRONDA_D016_HMAC_KEY_HEX`. Nunca divulgar ni regenerar accidentalmente.
- [ ] **BLOQUEO 1 — clave server-only Supabase:** crear/obtener desde Settings → API Keys en el dashboard de Supabase **proyecto `cotironda-piloto`** una clave nueva `sb_secret_...` y ponerla en Vercel proyecto `cotironda-portal-dev` → Environment Variables → `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`, destino **Preview** solamente y tipo `encrypted`. Verificar presencia sin leer/imprimir valor. **No enviar clave por chat ni poner en repo/frontend.** Este conector no permite gestionar claves secretas.
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
