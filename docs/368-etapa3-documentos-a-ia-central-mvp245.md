# Decisión 368 — Unificar cotizaciones documentales con IA Central (MVP245)

**Etapa 3 — Comprensión comercial de documentos. Fecha:** 06/11/2026.
**Alcance:** rama de desarrollo. No instalar aún migración en PILOTO; no
activar WhatsApp ni publicar producción.

## Auditoría del bloqueo

La ruta texto ya tiene asociación a ronda (MVP225), reserva de dos lecturas,
cotejo determinista, resumen privado (MVP227) y consulta anónima por rubro.
La ruta archivos conserva los originales cifrados/privados y su SHA binario,
realiza dos lecturas como BORRADOR y coteja PDF/Office/TXT con lectores
independientes (MVP106/111/130). Hasta MVP244, esa ruta no consumía la
función de análisis económico por rubro IA Central.

**Una propuesta del modelo no prueba los bytes del original.** Las fotos
o PDF escaneados, layouts PDF/Excel no soportados y archivos con celdas
ilegibles deben seguir en revisión; no habilitar una cotización o ranking
basados solamente en dos lecturas GPT.

## Cambio integrado solo en código (MVP245)

1. Después de almacenar por Whapi un archivo real y verificar SHA-256
   binario, la ruta documental existente hace doble lectura y exige
   coincidencia económica, conciliación de importes y comprobación
   determinista independiente desde el archivo original.
2. Solo cuando el verificador retornó `source_text_covered` con SHA y
   cantidad de renglones coincidentes, el módulo
   `ai-central-document-mvp245.ts` transforma los campos documentales
   acreditados en TEXTO DE TRABAJO, preservando cantidades, valores y notas
   literales de IVA/flete/pago. El original no se reescribe ni sustituye.
3. El lector comercial MVP225 procesa ese texto mediante **dos lecturas
   independientes**, coteja moneda, IVA, flete, pago, presentación, filas
   omitidas y operaciones en centavos exactos `BigInt`. Si una cita o
   importe no se puede acreditar, deja la fuente en revisión.
4. El RPC privado `cotironda_piloto_ia_reserve_media_mvp245` valida
   nuevamente la única invitación Whapi aceptada, el proveedor consentido,
   el mismo chat, misma ronda en plazo, el original almacenado y su SHA,
   la comparación y la acreditación documental. Cuota durable de 12/24 h.
   El resumen se guarda en la MISMA tabla de resultados por rubro
   `ai_supplier_review_mvp227`; la finalización MVP227 mantiene todas
   las protecciones del texto y añade rama documental con verificación
   de archivo. Mensajes duplicados no consumen nuevamente IA.
5. La vista privada del comprador continúa usando solo la **última
   oferta verificada** anónima de cada proveedor para su ronda;
   ninguna información personal, HMAC, archivo original o contacto
   sale en esa proyección.
6. Imagen/foto NO se promociona automáticamente por ahora, ya que falta
   corroborar el contenido visible desde el binario sin confiar solo
   en GPT; queda almacenada para revisión. DOC/XLS antiguos y PDF
   escaneados tampoco se marcan verificables. Todo archivo queda
   conservado en el circuito documental anterior.

## Gates de seguridad

- El nuevo puente no se invoca salvo que estén activadas *todas*
  las condiciones: enlace a ronda, análisis comercial, verificación
  documental válida y un flag EXTRA de entorno:
  `COTIRONDA_PILOT_AI_CENTRAL_DOCUMENT_QUOTE_ENABLED=true`.
- El flag nuevo arranca OFF por ausencia. No hay nuevos despachos,
  mensajes, adjudicaciones ni revelaciones.
- Los RPC son `SECURITY DEFINER`, con acceso expresamente revocado
  a `PUBLIC`/`anon`/`authenticated` y concedido solo a
  `service_role`; ejecutan controles internos de empresa y fuente.
- El inicio es idempotente por HMAC, con cuota de lectura y revisión
  persistente ante errores. No reintentar ciegamente una operación
  cuyo commit sea incierto.
- El piloto y producción quedan INTACTOS hasta autorización de
  publicación delimitada y prueba de preflight.

## Pruebas y criterios

- Node: PDF, XLSX, DOCX, CSV y TXT acreditados, documento ilegible,
  fotos, SHA/cantidad distintos, identidad falsa, duplicado,
  consulta por rubro y resumen sin datos personales.
- PostgreSQL 17 aislado: PDF de proveedor, dos rondas y dos
  proveedores, documento sin cobertura, con hash/propietario distinto,
  imagen no acreditada, doble reserva, origen ajeno, resumen con
  artículo de otra ronda, consulta de dos ofertas anónimas y permisos.
- Regresiones MVP225/227/241/242/243/244, Deno y Next.
- Se exige ROLLBACK de datos sintéticos; ningún envío WhatsApp.

## Qué impide cerrar la etapa 3 hoy

1. Esta integración aún requiere instalación **exclusivamente en
   PILOTO** tras autorización `Publicalo`, verificación de variables
   y control de permisos/RLS.
2. Fotos y escaneos, y documentos complejos fuera del lector binario,
   no tienen extracción comercial íntegra acreditada; deben pasar
   revisión en vez de fingir verificación.
3. Falta una prueba real autorizada de comprador + dos proveedores
   con PDF/Excel/foto, origen/IVA/flete/cantidad y seguimiento por rubro,
   con cotejo final contra cada presupuesto original.
4. No están habilitados por este cambio ranking final, adjudicación ni
   descarga de originales; son trabajos distintos de IA Central.

**No declarar cerrada la etapa 3 operativa hasta verificar esto.**
