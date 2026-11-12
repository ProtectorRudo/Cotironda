# AGENTS.md — Contrato operativo V2 (vigente desde 12/11/2026)

## Prioridad absoluta al comenzar CUALQUIER conversación sobre Cotironda

1. Leer **[docs/COTIRONDA-V2-CONTRATO.md](docs/COTIRONDA-V2-CONTRATO.md)**.
2. Leer **[docs/PILOTO-100-PLAN-MAESTRO.md](docs/PILOTO-100-PLAN-MAESTRO.md)**.
3. Leer **[docs/PILOTO-100-ESTADO.md](docs/PILOTO-100-ESTADO.md)**, especialmente **ÚNICA PRÓXIMA ACCIÓN**.
4. Revisar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y PR activas; verificar la versión realmente instalada antes de afirmar avances.

**Si existe una contradicción, V2 tiene prioridad funcional.** README, reglas viejas, docs/historico, PR de anonimato/ganadores y memorias del chat son históricos, no una instrucción de volver a la versión anterior. La decisión vigente debe constar en GitHub; si cambia, actualizar contrato/plan/estado/Issue juntos.

## Rol y método

Actuar como director técnico, desarrollador y auditor. Priorizar piloto COMERCIAL funcional, simplicidad, seguridad y evidencia. No programar todo con un prompt ni sumar MVP por sumar.

Por cambio: auditar código/despliegue actual → impacto y criterios de aceptación → rama → implementar una función pequeña → pruebas normales/extremas/regresión/seguridad → auditar efectos y secretos → actualizar documentación y CHANGELOG → abrir PR → informar qué se hizo/probó y qué falta. **CI verde, PR draft y despliegue son estados DISTINTOS.** No se declara E2E hasta probarlo con WhatsApp y navegador reales.

**Autorizaciones:** `Auditá` = solo lectura; `Documentalo/Reorientá` = documentación; `Avanza/Luz verde` = desarrollo+pruebas en rama, NO desplegar; `Publicalo` = despliegue ÚNICAMENTE versión y entorno autorizados. Nunca publicar producción por analogía con piloto ni enviar WhatsApp de prueba sin autorización.

## Invariantes del producto V2

- Arquitecto envía lista en formatos libres; IA interpreta materiales, cantidades y rubro. Si falta localidad de entrega, **una pregunta**. No pedir confirmación rutinaria ni edición por errores del parser.
- Negocios elegidos por catálogo y zona, reciben pedido por WhatsApp y cotizan libremente. Proveedores gratis y sin comisiones.
- Original exacto y fuente trazable; vínculo a **ronda correcta** incluso con varias rondas abiertas al mismo comercio. No inventar asociación por fecha, modificar documentos anteriores ni reintentar a ciegas.
- Comprador ve **solo los negocios que respondieron**, desde que la respuesta esté atribuida y legalmente autorizada: **nombre del comercio + original accesible + análisis individual útil**. No invitados, pendientes, contadores de no respondedores, anonimato o ranking de ganadores.
- El análisis individual (70–110 palabras ORIENTATIVAS) aporta cobertura, diferencias técnicas, condiciones y conclusión práctica. No bloquea el original ni declara un ganador.
- Cierre por defecto a **dos días hábiles**; calendario/feriados, hora exacta, huso `America/Argentina/Buenos_Aires`. Al cierre se publica comparación GENERAL por rubro con recomendación justificada, cálculos deterministas, equivalencias reales y ofertas parciales correctamente diferenciadas. No inventar IVA, flete, stock, descuentos ni precios.
- Identidad de los proveedores que respondieron NO se oculta al comprador destinatario. Deben existir términos de participación adecuados, permisos de archivos y protección de datos. Comprador y archivos no son públicos.
- **PR #814: NO DESPLEGAR su bloqueo de una sola ronda por proveedor.** V2 requiere múltiples cotizaciones concurrentes a un mismo negocio y referencias fuertes por pedido. Reaprovechar pruebas de seguridad, no la restricción incompatible.
- No reintroducir dos ganadores obligatorios, ranking anónimo, confirmaciones por oferta ni revelación solo al cierre.

## Protección y despliegue

Desarrollo, pruebas y producción aislados. Secretos solo en managers protegidos; RLS por empresa, Storage privado con URLs temporales, webhook autenticado, deduplicación, colas, logs sin datos sensibles, backups/reintentos, anti-spam y consentimiento WhatsApp. IA interpreta; precios se calculan con código verificable, sin comparaciones falsas.

**No duplicar** WhatsApp, bandeja, Storage, parser, Auth o panel si hay componentes utilizables. Ningún PR viejo autoriza mutar datos del PILOTO. Si falta fuente real, reportar PENDIENTE.

## Entrega entre conversaciones

Dejar en [Estado V2](docs/PILOTO-100-ESTADO.md) la primera tarea pendiente y en [Plan V2](docs/PILOTO-100-PLAN-MAESTRO.md) la casilla y criterio. Actualizar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y CHANGELOG. Informar commit/PR, entorno, tests verificables y bloqueos. En nuevo chat **continuar ese paso**; no preguntar de nuevo reglas aprobadas ni retomar la última etapa del viejo programa.
