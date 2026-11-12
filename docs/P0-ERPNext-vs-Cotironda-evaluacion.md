# P0 — Evaluación contrastada: ERPNext completo vs reutilización del núcleo Cotironda

**11/11/2026 | autorización «Luz verde» | ESTADO: decisión técnica de desarrollo, SIN instalación de ERPNext, SIN nuevas rutas ni despliegue.**

**Fuente del proyecto:** [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan de piloto 100%](PILOTO-100-PLAN-MAESTRO.md).

## Pregunta evaluada

¿Conviene sustituir Cotironda por un sistema de compras de código abierto «ya funcionando» y adaptarlo, o aprovechar el funcionamiento existente y separar la recepción de archivos del análisis económico?

**Regla de negocio determinante:** un arquitecto hace UN pedido y Cotironda solicita presupuestos por WhatsApp a 2+ negocios. Cada negocio responde en PDF, Excel, Word, imagen o texto libre, **sin iniciar sesión, rellenar ítems ni confirmar cada cotización**. Durante la ronda el arquitecto ve recepción sin contactos; al cierre descarga documentos originales solamente bajo acceso/consentimiento permitido. Después Cotironda puede ofrecer comparación de artículos verificados, pero nunca frena la existencia de una respuesta por falta de interpretación de IVA, flete o descuentos.

## Evidencia de código de ERPNext (repositorio oficial `frappe/erpnext`)

1. [Request for Quotation: código](https://github.com/frappe/erpnext/blob/develop/erpnext/buying/doctype/request_for_quotation/request_for_quotation.py): crea RFQ con proveedores e ítems, estados y envío al proveedor. Los destinatarios y respuestas se gestionan con registros ERPNext; puede producir PDF y enviar correo.
2. [Supplier Quotation: código](https://github.com/frappe/erpnext/blob/develop/erpnext/buying/doctype/supplier_quotation/supplier_quotation.py): controla proveedor, estado, impuestos, términos, cantidades y enlaza ítems con el documento fuente. **Solo comparar datos estructurados**, no cualquier PDF bruto.
3. [Supplier Quotation Comparison: código](https://github.com/frappe/erpnext/blob/develop/erpnext/buying/report/supplier_quotation_comparison/supplier_quotation_comparison.py): consulta `Supplier Quotation Item`, `item_code`, cantidad, unidad, precios, moneda, referencia RFQ; necesita que los datos estén escritos en estos campos.
4. [Documentación oficial RFQ](https://docs.frappe.io/erpnext/request-for-quotation): si un proveedor responde adjuntando PDF/correo, se adjunta como evidencia **y un usuario registra los datos comerciales en campos estructurados** para compararlo. Alternativa: portal del proveedor. [Guía de portal](https://docs.frappe.io/erpnext/how-to-create-a-supplier-quotation-through-the-supplier-portal): el proveedor necesita usuario web y cargar sus tasas.
5. [Licencia ERPNext GPLv3](https://github.com/frappe/erpnext/blob/develop/license.txt). Se permite uso comercial; redistribución o combinaciones de código requieren análisis jurídico específico. *No copiar módulos GPL al código privado de Cotironda sin esa revisión.*

**Lo que ERPNext resuelve bien:** RFQ y proveedores, cadena de documentos, control de estados, términos, trazabilidad y comparación tabular de renglones estructurados.

**Lo que NO resuelve para este piloto sin nueva integración:** asociación automática de una respuesta arbitraria por WhatsApp a nuestra ronda e invitación, ver «recibido» independientemente de la extracción económica, privacidad de ofertas y descarga de originales con nuestra política exacta de revelación. ERPNext sí puede guardar adjuntos, pero el circuito WhatsApp y el acceso del arquitecto en nuestra experiencia son adaptación adicional, NO una función comprobada en esta auditoría.

**Limitación explícita:** se inspeccionaron código y documentación oficiales; **no se instaló ni se ejecutó un servidor ERPNext**, ni existe prueba E2E ERPNext+Whapi en este informe. «Ya funciona ERPNext» no implica «funciona nuestro flujo».

## Evidencia VIVA de Supabase PILOTO (11/11/2026, lectura solamente)

Proyecto exclusivo: `ilggkalaafhtiysyzlmg`, entorno `cotironda-piloto`.

| Capacidad | Evidencia sin datos personales | Estado útil |
|---|---|---|
| WhatsApp ingreso | Edge `cotironda-piloto-whapi` v76 ACTIVE | Infraestructura desplegada, no E2E |
| Seguimiento | Edge `cotironda-piloto-seguimiento` v29 ACTIVE | Infraestructura, no entrega de archivos |
| Auto-recovery | Edge `cotironda-piloto-auto-recovery` v13 ACTIVE | Infraestructura, último reintento PDF falló |
| Storage/manifiesto privado | Tabla `media_archive_mvp095`: **8 stored, 8 con content_sha256**, 4 con `request_id` | Prueba de registros, **no** auditoría de bytes hoy |
| Cotizaciones documentales | `supplier_media_quotes_mvp098`: 4 registros `awaiting_fidelity_check`, con `request_id` | Asociación en tabla, no aprobación económica |
| Proyecciones anónimas | `anonymous_offers_mvp091`: **0** | Bloqueo de visibilidad actual |
| Compradores autenticados | `auth.users`: **0** | Bloquea descarga real |
| Política de originales | `original_share_policy_mvp178.enabled=false`, `activated_at` nulo | Nunca habilitada |
| Autorizaciones de originales | `original_share_consents_mvp178`: **0** | Bloquea descarga real |
| Auditoría de descarga | `original_download_audit_mvp201`: 0; RPC privada existente, solo service_role | Esquema/RPC existen, ninguna descarga |
| Ronda en curso | 1 `prepared` vigente, 0 outbox incierto | No crear ronda solapada |

**Precisiones críticas:** cuatro `request_id` NO prueban que el vínculo sea correcto con dos proveedores actuales; hay casos históricos ambiguos. Los 8 SHA en base no son una verificación byte-a-byte en esta auditoría. RPC instalada no equivale a endpoint autenticado funcionando. Comprobar en P1/P2/P4.

## Revisión Vercel (11/11/2026, lectura sin modificaciones)

**Hay varios proyectos Vercel vinculados a un mismo repositorio, no un portal único de piloto.** No confundir una compilación READY con un circuito publicado y probado:
- `cotironda`, proyecto principal: último **production READY** comprobado en rama `main`, SHA `5987f1705ff1dba609489374531fa9e942150e7a`, corresponde a la **demostración web aislada** de Cotironda, NO a la ronda documental E2E. Se observan otras compilaciones `Preview READY` en ramas de desarrollo y documentación.
- `cotironda-seguimiento-vista-piloto`: último **production READY** registrado en SHA `6ab1632581ca054b985a309cf71a9b85ac2831d0` de rama histórica de desarrollo; las últimas previews automáticas para cambios solo documentales en la rama del plan aparecen `ERROR`, mientras una preview anterior muestra `READY`. Hay que identificar ruta de navegación real y analizar causa de error ANTES de elegir este proyecto como portal comprador.
- `cotironda-seguimiento-web-piloto`: existen previews antiguas `READY`, pero el despliegue registrado en `production` es `ERROR`.
- `cotironda-portal-dev`: se encontraron previews `READY` de ramas antiguas, NO prueba de login Auth PILOTO ni descargas.

**No se disparó un despliegue manual en esta auditoría** ni se modificó el objetivo `production`. Sin embargo, la integración GitHub↔Vercel crea **Previews automáticas** por commits en ramas, incluso cuando se modifica solo Markdown. Nunca afirmar «cero deploys» sin distinguir estos builds de una publicación operativa de piloto o producción.

**Implicación P0:** identificar UNA URL autorizada del comprador, contrato de la Edge de seguimiento y ruta de originales; evitar usar como evidencia una preview de proyecto diferente. Anotar commit/SHA exacto y entorno; testear navegador con identidad sintética y luego comprador real autorizado.

## Evidencia de código Cotironda (rama técnica PR #793, NO integrada)

- [Webhook de Whapi](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/supabase/functions/cotironda-piloto-whapi/index.ts): archiva mensajes y multimedia, intenta vincular respuesta y ejecuta análisis posterior.
- [Tracking Edge](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/supabase/functions/cotironda-piloto-seguimiento/index.ts): muestra contadores y proyecciones económicas revisadas, pero NO lista originales descargables.
- [Vista comprador M227](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/src/domain/ia-central/vista-comprador-rubros-mvp227.ts), [vista pendientes M299](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/src/domain/ia-central/vista-pendientes-rubros-mvp299.ts) y [estado comercial M326](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/src/domain/ia-central/estado-revision-comercial-mvp326.ts): actualmente dependen de proyecciones económicamente revisadas. **P3 necesita un estado independiente de «archivo recibido y vinculado»**, sin dar acceso al contenido.
- [Descarga HTTP MVP190](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/src/server/originales-descarga-http-mvp190.ts) y [gate MVP161](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp353-preflight-sin-ronda-duplicada-20261111/src/domain/descarga-originales-mvp161.ts): diseñados con comprobación SHA, sesión Auth del comprador, ronda cerrada, autorización prospectiva; **no se deben conectar a un token WhatsApp compartible**. La base tiene política/RPC pero están OFF/0 usuarios/0 consentimientos.

## Alternativas y decisión

| Alternativa | Ventaja real | Costo/riesgo crítico | Dictamen |
|---|---|---|---|
| **A. Sustituir núcleo por ERPNext + portal** | RFQ, proveedores, comparador y permisos estructurados ya maduros | Perder cero fricción: el negocio debe ingresar precios o alguien registrarlos; nueva infraestructura, migración y doble adaptación WhatsApp | **No adoptar en P0–P5** |
| **B. ERPNext como microservicio «headless» junto a Cotironda** | Poder aprovechar lógica interna de RFQ/compras | Dos bases/identidades, integración de modelos, sincronización, costo y observabilidad duplicados; no reduce archivo libre | **No adoptar** |
| **C. Mantener núcleo actual y desacoplar estados documentales** | Whapi, Storage/RLS, manifiestos, tracking y base de descarga ya existen; reutiliza inversión sin nuevos servidores | P2 atribución aún insuficiente y P3/P4 no operativos | **Elegida para piloto**, contra criterios de aceptación reales |
| **D. Integrar un gestor documental genérico externo** | Buenas funciones de archivo y búsqueda | Otra base/servicio, no resuelve rondas, contacto ni privacidad | **No para circuito crítico** |

**Decisión de producto/tecnología:** **conservar Next.js + Supabase + PostgreSQL + Whapi para P0–P5**. Inspirarse en ERPNext en la relación determinista RFQ/invitación/respuesta/original, su estado independiente y su comparación de líneas. **No copiar código GPLv3 al proyecto** ni desplegar un ERPNext adicional. Bibliotecas pequeñas con licencia compatible y necesidad demostrada se pueden evaluar de forma separada. No incorporar OCR o IA nuevos antes de cerrar P1–P5.

**Regla de reconsideración:** si tras una prueba reproducible con **los mismos 2 presupuestos reales**, ninguna ruta existente permite archivar, asociar, mostrar recepción y descargar de forma segura SIN reconstruir múltiples componentes críticos, volver a evaluar ERPNext u otra base abierta con un **prototipo funcional desplegado SOLO EN DESARROLLO**, métricas de integración, costos operativos y licencia. Esta decisión no es dogmática.

## Próxima acción de código — NO más documentos abstractos

**P1/P2 — construir la mínima proyección de respuesta documental segura:**
1. Reutilizar `media_archive_mvp095`, `invitations`, `ai_dispatch_jobs_mvp222` y `ai_supplier_links_mvp225`; revisar invariantes y la relación exacta en SQL, sin asociar por fecha.
2. La recepción del archivo debe quedar persistida aunque la IA falle; distinguir `stored`, `associated`, `under_review` y `source_verified`, sin llamar «presupuesto verificado» a un mero archivo.
3. Crear **una sola** RPC privada y autenticada de estado documental para la ronda, sin mensajes, teléfonos, SHA, rutas, importes ni identificadores de proveedor; no filtrar más documentos de los que un comprador puede saber.
4. Integrar el contador de recepción al tracking SOLO tras tests RLS/ACL, revisiones con rondas ambiguas y autorización explícita de publicación. No exponer documentos antes del cierre.
5. En P4, conectar descarga existente, dando prioridad a login y a la política de originales. No omitir consentimiento de participantes ni habilitar archivos de no ganadores hasta resolver el alcance de contactos.

### Criterios de aceptación concretos para siguiente PR de código
- Dado un PDF original archivado y **asociado inequívocamente** a una invitación ya despachada, la UI muestra «recibido» aun si la lectura económica termina `review`.
- Si la fuente está archivada pero **sin ronda segura**, no se cuenta falsamente como recibida por otra empresa o arquitecto; caso privado para resolución interna.
- Dos notificaciones Whapi duplicadas no duplican respuesta.
- El endpoint de seguimiento no entrega nombre, teléfono, email, QR, contenido, SHA, Storage URL, precio no acreditado ni ID privado.
- Unidad/IVA/flete/descuentos nunca se completan por inferencia.
- Antes de cierre no se descarga; tras cierre exige política aplicable, consentimiento, Auth comprador, RLS/empresa y SHA.
- 2 proveedores/2 archivos reales en un navegador: **P5 todavía pendiente**.

## Verificación y límites de ESTA evaluación
- ERPNext: inspección de cuatro fuentes oficiales de código y documentación; licencia GPLv3 verificada; **sin ejecución de ERPNext**.
- Cotironda: inspección de fuente del webhook, tracking, selector y descarga; Supabase consultas SELECT, conteos y roles sin secretos, ningún cambio de datos; CI histórica de PR #793 (unitarios, Next, PG17 y PostgREST) exitosa sobre ese SHA pero NO prueba este E2E.
- **No se hicieron** tests de comportamiento del código nuevo porque NO se modificó código ejecutable. El primer próximo desarrollo debe incluirlos.
- Ningún rollback requerido: sin migraciones, Edge, Whapi ni Vercel cambiados.

**Relación:** Issue #794; PR documental #795; técnicos #790–#793; bug de correlación #750.
