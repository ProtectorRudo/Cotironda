# Cotironda — Plan maestro del piloto documental 100%

**Evaluación de reutilización (P0, solo desarrollo):** [ERPNext vs núcleo Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Decisión: conservar el núcleo existente y reusar el MODELO de trazabilidad RFQ/original de ERPNext; no instalar ERPNext ni importar código GPL. Esta evaluación NO completa P0 ni el piloto E2E: faltan permisos/consentimiento de originales y prueba real.

**Decisión de producto:** 11 de noviembre de 2026. **Estado de este documento:** planificación, no código desplegado. **Único tablero de tareas:** [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **Estado diario y próxima acción:** [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md).

> REGLA DE CONTINUIDAD: al comenzar cualquier conversación sobre Cotironda, abrir primero Issue #794, leer este contrato y el estado diario, inspeccionar código/PR y verificar datos de Supabase; continuar el primer paso NO aprobado. Nunca inferir del historial del chat que un deploy o una prueba externa fue ejecutada.

## Para quién existe Cotironda

El arquitecto y la constructora compran una solución para ahorrar tiempo y conseguir alternativas útiles de suministro. El valor no es vender un archivo PDF. Cotironda reúne solicitudes enviadas una vez, busca comercios pertinentes, recibe respuestas por WhatsApp, muestra qué llegó, conserva evidencia y permite decidir con tranquilidad.

- Proveedores: participación gratuita y sin comisiones; cotizan como siempre por WhatsApp.
- Compradores: abono proyectado ARS 10.000 por mes, prueba gratuita y precio/uso razonable sujetos a validación real. No anunciar resultados económicos aún no corroborados.
- Piloto inicial: 1 comprador y 2 proveedores previamente habilitados, formatos distintos, localidad de entrega explícita (única aclaración si falta). No pedir que compradores o proveedores editen, confirmen o reenvíen cotizaciones por defectos del parser.
- Cotironda no compra materiales ni garantiza ventas; contacto comercial y decisiones del comprador respetan la política vigente.

## CAMBIO DE MÉTODO — nuevo camino crítico

ANTES: archivo -> IA interpreta 100% -> conciliación económica -> asociación -> oferta visible -> cierre.

AHORA: archivo -> archivado inmutable -> asociación segura a ronda -> proyección pública mínima de recepción -> cierre -> autenticación y original autorizado. Análisis de productos, precios y ranking son **procesos posteriores independientes** y nunca bloquean el estado «recibido con asociación verificada».

### Estados separados (no mezclar)
1. **Mensaje ingresado:** webhook autenticado, deduplicado, participante reconocido.
2. **Original archivado:** bytes privados intactos, hash SHA-256/tamaño/tipo y manifiesto de origen; para texto, copia exacta inmutable.
3. **Asociado a ronda:** evidencia concreta de invitación y destinatario; el documento puede quedar temporalmente en revisión interna si hay dos solicitudes candidatas.
4. **Recepción visible:** únicamente al comprador autorizado de la ronda; etiqueta Proveedor A/B, rubro y fecha, sin identidad/contacto ni acceso al contenido previo al cierre. «Recibido» NO significa «precio verificado».
5. **Interpretado parcialmente:** artículos/importes extraídos con respaldo, separados de la existencia del original. Errores de IA no eliminan ni modifican el original.
6. **Económicamente comparable:** unidades/cantidades/IVA/flete/descuentos/condiciones corroborados, cobertura separada de precio y ofertas parciales visibles como tales.
7. **Ronda cerrada y descargable:** original legítimo para comprador autenticado, con autorización específica, registro de acceso y SHA comprobado al descargar.

**Nunca:** regenerar un PDF «idéntico» con IA generativa, inventar importes, borrar el original, mostrar monto como verificado cuando no lo está ni inferir vínculo al pedido por proximidad de fechas.

### Flujo arquitectónico sin reescribir el sistema
WhatsApp Whapi -> webhook existente -> inbox + Storage privado -> correlación de ronda (proveedor, mensaje citado/ID de pedido/invitación/despacho y evidencia temporal secundaria) -> registros de documentos asociados -> proyección de seguimiento de estado -> cierre existente -> API Auth+RLS+consentimiento+SHA -> descarga original. Los módulos IA/normalización/comparador consumen el archivo en paralelo o diferido y escriben exclusivamente proyecciones verificadas.

No crear segundo pipeline de ingestión ni otro backend de descargas. Reutilizar exactamente lo que exista y esté auditado. La «revisión operativa» para casos ambiguos no debe pedirle al proveedor reenvío ni permitir al operador escoger un destinatario sin evidencia.

## Decisión pendiente y bloqueo de seguridad para P4

El objetivo comercial es que, **al cierre**, el comprador pueda obtener los originales con identidad del proveedor. Sin embargo:
- Regla histórica: contactos directos al comprador solo de 2 ganadores, aunque las identidades de todos los invitados se revelan al cierre.
- Un original de proveedor puede incluir logo, teléfono, correo, CUIT, dirección, web, QR, datos bancarios y nombre comercial.
- Por tanto, descargar TODOS los originales con datos cambia materialmente la política de acceso/contactos.

**Resolver en P0** el alcance definitivo del documento completo de TODOS los participantes, y el consentimiento/aviso prospectivo incluido en el alta o invitación. Hasta entonces, deshabilitar la liberación de originales identificables de no ganadores; no sustituir consentimiento por una inferencia. No introducir nuevas confirmaciones en cada mensaje. Proteger siempre datos privados del comprador antes de las reglas de cierre.

## Controles del avance MVP354 (11/11/2026)

- [x] Código de la RPC documental y DTO de 8 campos seguros en [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797) (desarrollo, **NO integrado**).
- [x] Tracking con opt-in **OFF por defecto**, sin reemplazar contador económico ni exponer contenido.
- [x] SQL de solo lectura ensayado en piloto: token inválido `not_found`; ronda preparada 2/0.
- [x] CI unitaria general, Deno Whapi, PostgREST y PostgreSQL17 de aislamiento histórico **verdes** sobre commit `c8a937f614a701ea2eb46e366685668021da79ee`.
- [x] **Build Next.js del SHA `c8a937f614a701ea2eb46e366685668021da79ee` completado con éxito**; mismo SHA con unidad/PG17 histórico/PostgREST/Deno verdes.
- [ ] **PG17 específico de DDL MVP354**: fixture y workflow creados; también agregado a la batería existente en el PR técnico para que se ejecute en CI. **Resultado específico pendiente de comprobar en SHA `97bf726dea3add014b027c971156a79b0126390c`**. No confundir con PG17 histórico.
- [ ] Asociación de 2 archivos reales e ingreso de texto libre, recuperación por SHA de bytes (P1/P2) y navegador del comprador real (P3).
- [ ] P0 identidad de comprador, reglas de originales de no ganadores y ruta efectiva autorizada.

**Semáforo:** P0 [ ], P1 [ ], P2 [ ], P3 [ ], P4 [ ], P5 [ ]. Es avance real de código pero no de piloto en ejecución. No aplicar SQL ni activar flag sin «Publicalo».

## Avance técnico verificable — PR #797 / MVP354 (11/11/2026)

**Desarrollo propuesto, no publicado ni integrado:** [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797), apilado sobre el técnico #793. Se implementó la primera vía de **recepción documental independiente de IA económica**: RPC de SOLO LECTURA que exige comprador con token válido, invitación y despacho Whapi aceptado, proveedor coincidente con HMAC, original almacenado con SHA y ausencia de otra ronda aceptada del mismo proveedor en la misma ventana; cuenta una vez por proveedor. Su respuesta pública queda limitada a 8 campos de conteos y booleanos siempre `false` para revelar precios/contactos/descargas. Edge integra la llamada opcional bajo flag **OFF por defecto**, sin modificar los estados o números económicos previos; HTML distingue claramente archivo recibido de precio verificado.

**Validación hasta ahora:** consulta SELECT del cuerpo SQL sobre piloto (sin instalar RPC) con token inexistente -> `not_found`; para prepared vigente -> 2 despachados, 0 archivos acreditados, 2 pendientes. Unidad/ACL/banco real y navegador **aún deben verificarse en CI y piloto**, por lo tanto **P1, P2, P3 no terminadas**. Este camino solo cubre adjuntos archivados; las respuestas de texto sin archivo necesitarán fuente propia inmutable. No confundir 0 archivos con 0 mensajes de proveedor ni reconocer documentos de otras rondas por fecha.

**Pendientes para activación:** PostgreSQL17 con rollback de RPC + prueba de roles y revocación; verificación contra dos archivos realmente recibidos, duplicados, otra empresa, ronda solapada y comprador autenticado; confirmar URL de portal; política de originales/contactos P0. No habilitar el flag ni publicar Edge hasta superar estas pruebas y recibir «Publicalo en piloto».

## Hoja de ruta verificable

| Etapa | Trabajo necesario | Prueba de aceptación | Avance inicial |
| --- | --- | --- | --- |
| **P0** | Auditar estado desplegado, rutas y permisos, requisitos y política de contacto/originales | Matriz código-deploy-pruebas y regla de revelación explícita, no contradictoria | Pendiente |
| **P1** | Archivo inmutable para PDF/Excel/Word/imagen/texto | Recuperación byte a byte + SHA, reintentos, deduplicación y error seguro | Pendiente |
| **P2** | Asociación inequívoca a ronda y control de rondas superpuestas | Dos presupuestos reales correctamente ligados; ambiguos privados, empresa cruzada rechazada | Pendiente |
| **P3** | Mostrar recepción por rubro sin ranking obligatorio | 2/2 documentos visibles en el portal real aunque IA falle; ningún contacto filtrado | Pendiente |
| **P4** | Cierre y descarga original autenticada, autorizada y auditada | Usuario correcto descarga, ajeno/no vencida/revocado falla; SHA intacto y sesión comprobada | Pendiente |
| **P5** | Prueba E2E de un comprador, dos proveedores y formatos diferentes | WhatsApp -> dos respuestas -> navegador -> cierre -> dos descargas en una misma ronda | Pendiente |
| **P6** | Comparador inteligente progresivo y opcional | Cobertura vs precio, rubros, gastos y flete/IVA explícitos, sin falsas clasificaciones | Pendiente, NO condiciona P5 |
| **P7** | Estabilidad y validación comercial | Varias rondas repetibles, monitoreo, seguridad, gastos, recuperación y comprador dispuesto a pagar | Pendiente |

**Primera meta E2E: P0–P5.** **Piloto comercial al 100%:** P0–P5 + controles de operación/seguridad y repetición de P7; P6 puede desarrollarse sin bloquear recepción. No significa que todos los modelos de presupuesto futuros sean legibles por IA.

### P0: tareas técnicas
- [ ] Reconstruir arquitectura desde archivos actuales y conexiones live, no desde memoria/README obsoleto.
- [ ] Verificar qué versión exacta está en Supabase Edge, SQL, cron, Storage y Vercel; comparar con GitHub PRs #790–#793 y la rama main.
- [ ] Identificar tabla/estado de archivo recibido, recibido validado, remitente, invitación, ronda, revisión y descarga. Mantener nombres reales en la matriz.
- [ ] Documentar política final original/identidad/contactos vs 2 ganadores con consentimiento, revocación, retención y uso de WhatsApp; ninguna exposición sin validarla.
- [ ] Establecer tests, presupuesto IA/Whapi, cuotas, y un solo recorrido a desarrollar primero.
- [ ] Actualizar Issue #794: marcar P0 solo cuando todo lo anterior tenga evidencia.

### P1–P2: tareas técnicas
- [ ] Duplicación de mensajes: mismo ID Whapi reintentado no duplica documento ni envío.
- [ ] MIME, tamaño, hash, bytes, PDF multipágina, XLSX con varias hojas, JPG, TXT y errores de descarga.
- [ ] Asociar fuente por proveedor/invitación verdadera/ID conversación, no solo por fecha o cercanía de cantidades.
- [ ] Dos rondas candidatas: cola/revisión interna segura; proveedor nunca debe ser obligado a reenviar.
- [ ] Al menos dos proveedores y dos empresas sintéticas: bloqueo de acceso cruzado.
- [ ] Documentar verificación real de dos documentos con trazas que no expongan datos comerciales.

### P3: tareas técnicas
- [ ] Crear proyección segura de estado por rubro: invitados, enviados, respondidos, documentos asociados, pendientes.
- [ ] «Documento recibido» no debe depender de line items, total ni clasificación de IVA/flete.
- [ ] Si archivo ambiguo/no asociado, NO mostrarlo como presupuesto de una ronda equivocada; ofrecer estado genérico sin identidad donde sea seguro.
- [ ] Reusar el enlace de seguimiento existente, con protección contra difusión de su token y datos identificatorios.
- [ ] Probar navegador y falsos positivos; nada de imágenes anonimizadas no verificadas.

### P4: tareas técnicas
- [ ] Reutilizar Auth y originales MVP178/190/191/192/200/201/207; verificar qué está compilado/publicado y qué está apagado.
- [ ] Auth comprador PILOTO real; empresa/rol/propiedad de ronda y sesión fresca; RLS y autorización de proveedor versionada.
- [ ] Prohibición antes de cierre; original SHA, MIME, tamaño, nombre opaco y Cache-Control no-store.
- [ ] Auditoría de lectura, revocación posterior, rate limits y error de Storage.
- [ ] Archivo íntegro del proveedor correcto, no nueva versión sintetizada ni URL de Storage pública.
- [ ] Registrar explícitamente contactos permitidos según decisión P0, sin adelantarlos por accidente.

### P5–P7: prueba y salida comercial
- [ ] E2E controlado con participantes consentidos, sin rondas superpuestas.
- [ ] Comprobar una sola solicitud por WhatsApp a cada negocio y respuesta en dos formatos.
- [ ] Comprobar que el comprador ve inmediatamente «recibido» tras asociación verdadera; sin intervención técnica.
- [ ] Al cierre, verificar bloqueo de descarga temprano, accesos a originales finales y auditoría.
- [ ] Casos extremos: respuesta fuera de plazo, archivo inválido, falta de zona, presupuesto parcial, doble webhook, proveedor equivocado, token de seguimiento compartido, dos empresas.
- [ ] Monitoreo de tiempos de respuesta, errores, costes y reintentos; backup/restore y alertas.
- [ ] Entrevistar al comprador: ¿ahorra trabajo? ¿volvería a usarlo y pagaría abono? Sin esto, no declarar viabilidad comercial.

## Protocolo de ejecución para futuras conversaciones

1. Buscar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md), luego leer AGENTS, README, código y último PR relevante.
2. Revalidar en vivo Supabase piloto: rondas, mensajes asociados, originales guardados, ofertas, flags y riesgos; distinguir datos históricos y actuales.
3. Elegir **UNA SOLA etapa no aprobada** como foco. No crear nuevas variantes PDF/IA si no bloquean directamente esa etapa.
4. Abrir Issue/PR en rama; probar happy path, edge, seguridad y regresión; documentar. Sin integración/publicación no autorizada.
5. Al terminar, actualizar este documento/Issue #794 con estado, pruebas, PR, commit, entorno, riesgos y **siguiente paso único**. Si una etapa no pasó, dejarla [ ] y no declararla terminada.
6. Interpretar permisos: «Auditá» solo lectura; «Documentalo» registro; «Luz verde» desarrolla y prueba sin publicar; «Publicalo» solo versión/entorno autorizados, distinguir publicar código de enviar WhatsApps reales.

**Éxito = evidencia externa de un comprador recibiendo DOS documentos reales desde dos proveedores y descargándolos al cierre de la misma ronda.** Tests aislados, rutas construidas o archivos en base no equivalen a esto.

## Enlaces
- [Issue canónico #794](https://github.com/ProtectorRudo/Cotironda/issues/794)
- [Bloqueo histórico #750](https://github.com/ProtectorRudo/Cotironda/issues/750)
- [PR #793 preflight](https://github.com/ProtectorRudo/Cotironda/pull/793)
- [PR #792 parsing contextual](https://github.com/ProtectorRudo/Cotironda/pull/792)
- [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md)
