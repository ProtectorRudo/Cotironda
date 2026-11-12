# Cotironda V2-04b — conexión de original a guía privada del comprador

**Fecha:** 12/11/2026 · **Estado:** candidato en PR #825, no desplegado, no E2E real.

## Implementación

El circuito privado se diseñó como una operación idempotente:
1. El comprador autenticado consulta el catálogo de **proveedores que efectivamente respondieron**, nunca invitados sin respuesta. El portal consulta la RPC privada `cotironda_piloto_v2_responders_with_analysis_private`, que revalida identidad, sesión viva, consentimiento V2 prospectivo y SHA del original.
2. Al mostrar una respuesta, la interfaz ejecuta automáticamente y sin confirmación el POST `/api/piloto/v2/rondas/:rondaId/originales/:documentoId/analizar` con el JWT del comprador. El endpoint está apagado por defecto, solo en **preview** y con SHA exacta del release.
3. El servidor revalida `getUser(jwt)` y la sesión/permiso usando `cotironda_piloto_v2_original_source_private`. Reserva el análisis mediante `cotironda_piloto_v2_analysis_claim_private` con token único y huella del original. No se puede gastar IA dos veces en paralelo para un documento.
4. Descarga el archivo desde Storage privado, verifica los **bytes SHA-256**, extrae de manera conservadora TXT/CSV o Word/Excel OpenXML usando el lector ya probado `supplier-source-office.ts`, y calcula SHA del texto EXTRAÍDO (distinto del SHA binario para Office). PDFs/imágenes o Word/Excel antiguos quedan pendientes hasta tener extracción independiente apta para ese formato. No se inventa texto desde bytes ilegibles.
5. La IA Central genera 2–4 observaciones breves con cita literal exacta, sin rankings, sin alterar importes y sin declarar IVA/flete no escrito. El servidor revalida identidad y consentimiento; SQL persiste solo el resultado verificable asociado a `(ronda,documento,sha_original)` mediante ticket de 90 segundos.
6. El portal muestra la guía respaldada por citas al lado de la descarga **original inalterada**. Si el análisis falla, la cotización original sigue disponible. SQL limita cada documento a tres intentos, con 5 minutos de espera para nuevos intentos tras revisión y sin reanalizar documentos ya listos.

**Sin exposición pública:** tabla `v2_original_analysis` en esquema privado con RLS y sin permisos directos `anon/authenticated/service_role`; RPC `SECURITY DEFINER` ejecutables solo con `service_role` que revalidan explícitamente comprador y original. No se agrega autorización por token de URL ni por nombre de archivo, no se expone ruta HMAC ni contacto de otro cliente.

## Pruebas requeridas

- [ ] PostgreSQL 17 (transacción rollback): identidad de comprador ajeno, reserva exclusiva, antiguo ticket inválido, revisión y cooldown, persistencia, revocación y ausencia de permisos públicos.
- [ ] Node: original auténtico, SHA byte a byte, fuente adulterada, CTA automático, llamadas duplicadas, discrepancia posterior de consentimiento, proyección de citas y PII.
- [ ] Next.js: portal renderiza comentarios, Auth y endpoint privado sin secretos en cliente.
- [ ] Regresiones generales sin alterar los módulos históricos Whapi v76.
- [ ] Prueba **real** con comprador Auth y dos proveedores y archivos distintos por WhatsApp, sin inferir asociaciones ambiguas.

## Bloqueos reales para publicar

- Las RPC V2-03a/03b nuevas aún NO están instaladas en el proyecto PILOTO. Requiere instalarlas **en orden**, con respaldos y flag OFF, y revisar el esquema en vivo.
- En Supabase PILOTO se verificó **auth.users=0**. Se requiere alta correcta y validación de sesión del comprador para probar el portal. Consentimiento para compartir originales de cada proveedor debe ser verdaderamente prospectivo y verificable; no se supone de opt-in genérico.
- La nueva ruta captura documentos archivados **TXT/CSV/DOCX/XLSX**, pero **todavía NO** interpreta texto de PDF, imagen u originales de WhatsApp sin archivo. Pendiente incorporar lector PDF seguro para el resumen, además de capturar respuestas de texto puro como originales.
- Persistencia del análisis está preparada a partir de una petición automática del portal; todavía no existe un trabajador autónomo en segundo plano para documentos recibidos cuando el comprador no está viendo la pantalla. De momento se analiza al ingresar el arquitecto.
- Al cierre sigue pendiente el informe general y el reloj real de dos días hábiles. La IA Central debe administrar fuentes de calendario automáticamente, con cálculos deterministas y sin trasladar tareas a usuarios.
- `Publicalo` es imprescindible para instalar migraciones SQL, configurar variables de entorno, desplegar Vercel/Edge y enviar mensajes en PILOTO. **Este PR no hace nada de eso.**

Referencia: [PR #825](https://github.com/ProtectorRudo/Cotironda/pull/825), apilado sobre #824 y anteriores. No tocar producción ni reemplazar el código activo del webhook v76 sin preflight autorizado.
