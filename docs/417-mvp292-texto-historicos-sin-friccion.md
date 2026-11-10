# Decisión 417 — MVP292: texto libre e históricos sin intervención

**Fecha:** 07/11/2026. **Estado:** desarrollo y CI, NO publicado. Continúa [PR #683](https://github.com/ProtectorRudo/Cotironda/pull/683) y [decisión 416](416-mvp291-correlacion-automatica-sin-friccion.md).

## Alcance comercial obligatorio
No pedir al comprador ni al proveedor códigos de selección, identificar entre rondas, subir archivos nuevamente ni confirmar la asociación. Un presupuesto entrante debe interpretarse, cotejarse con pedidos efectivamente enviados al proveedor y publicarse anónimamente **solo** si la identidad de ronda y la integridad económica son acreditables. La IA interpreta materiales, la aplicación prueba cantidades/equivalencias y SQL autoriza el vínculo; nunca usar el total económico, la fecha más reciente ni la identidad del negocio para inventar destinatario.

## Texto libre
1. Un mensaje WhatsApp consentido y firmado se archiva bajo AES-GCM con `plaintext_sha256`. Si el ruteador comercial MVP225 detecta `ambiguous_round`, la función `extraerMaterialesTextoMvp292` realiza DOS lecturas independientes de las **citas literales** de productos, cantidades y unidades. La validación rechaza precios como cantidades, descripciones inventadas, citas con teléfonos/moneda y lecturas divergentes. No borra ni cambia el texto original.
2. En privado SQL service-role, `stage_supplier_text_mvp292` vincula esas observaciones no económicas a HMAC del evento, chat, SHA del texto cifrado, proveedor y `unresolved`, en una tabla con RLS y dedupe.
3. `auto_correlation_prepare_mvp291` utiliza el MISMO broker de candidatos previamente despachados que los PDF; dos lecturas de comparación semántica con razonamiento de unidades/contenidos y umbral determinista deben producir un único candidato. `bind_mvp291` vuelve a comprobar despachos/roles/SHA/vigencia y liga únicamente inbox + auditoría para fuentes textuales (no crea un archivo falso).
4. Tras ligarlo, **solo** `procesarPresupuestoCentralMvp227` puede leer nuevamente el original cifrado y verificar precios, condiciones, cobertura y rubro. No asumir que asociación es verificación ni publicar un ranking automático.

## Recuperación histórica sin WhatsApp
1. El RPC privado `claim_auto_recovery_mvp292` reserva **un solo** original irresuelto, de los últimos 7 días, que llegó después de un despacho realmente aceptado a ese proveedor y pertenece a una ronda todavía vigente. Bloquea reintentos/cargos repetidos por HMAC, cuotas de 12 casos/día y registros terminales de revisión/incertidumbre.
2. El ejecutor interno (Edge separada `cotironda-piloto-auto-recovery`) exige un secreto rotativo propio y tres gates OFF por defecto. Consulta vía service-role privado y procesa como máximo una fuente por invocación. No lleva token Whapi ni números de contacto ni utiliza enlaces públicos.
3. Para WhatsApp textual, descifra en memoria con la misma AES-GCM y AAD, vuelve a calcular SHA y usa doble extracción y correlación. Para documentos PDF/Office/fotos, descarga solo `cotironda-piloto-originals/media/<HMAC>`, compara tamaño y hash del binario, realiza una segunda lectura de la misma fuente y exige concordancia física antes de decidir el vínculo.
4. El registro de archivo (`reserve_archive_replay_mvp292`) limita a UN intento verificable por original. El procesador reabre el original almacenado, conserva la doble lectura, auditoría aritmética, validador independiente del formato, comprobación económica de SQL y publicación anónima ya existentes. Fotos/formatos sin cobertura independiente siempre quedan en revisión.
5. Ante fuente dañada, invalidación por cierre/consentimiento, modelo incierto, duplicados o rondas indistinguibles, no inventar el vínculo, no enviar WhatsApp y no reintentar facturación automáticamente. Registrar motivo privado; continuar solo por reconciliación interna autorizada.

## Seguridad y despliegue
- Migraciones: `mvp292_auto_correlacion_texto_proveedor.sql` y `mvp292_recuperacion_interna_archivos.sql`. Tablas privadas/RLS, grants solo `service_role`, funciones `SECURITY DEFINER search_path=''`, SHA/HMAC, cupos y validación de fecha/rol/despacho antes de asociar.
- Flags hasta un `Publicalo` separado: `COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED`, `COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED`, `COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED` **OFF**. Asimismo mantener los límites individuales de IA documental y análisis comercial. El modo autónomo desactiva el antiguo mensaje de `CONSULTA_RONDA_MVP239`.
- **No se crea cron automáticamente ni se instala secreto de scheduler** con este desarrollo. La programación posterior debe usar un disparador privado autenticado, secreto segregado, rotación y auditoría de costes. Nunca poner el secreto de service-role en una URL, cliente público, pg_net sin medidas ni logs.
- El ejecutor no publica una oferta directamente; solo invoca las funciones preexistentes que requieren auditoría de fuente y condiciones. No crea invitaciones, no modifica ranking ni contactos.
- La prueba de CI es PostgreSQL 17 en `BEGIN/ROLLBACK` con pedidos legacy + IA Central, y Node/Deno offline con originales y WhatsApp sintéticos. **No representa prueba E2E real ni autoriza desplegar.** Antes del piloto: verificar gates, costos, quorum de proveedores y apertura anónima; probar una cotización textual ambigua y un original histórico desde Storage con consentimiento real.
- Imposibilidad física: dos rondas indistinguibles sin pistas adicionales no tienen respuesta cierta, por muy potente que sea la IA; el software conserva el original y se abstiene internamente sin presionar a proveedor/comprador.

## Pendiente después del desarrollo
1. Fusionar PR y revisar CI completa.
2. Solo con `Publicalo`: instalación en `cotironda-piloto`, bundle Edge completo, secreto separado del ejecutor y configuración explícita del schedule en un entorno seguro (no cron ni producción por defecto).
3. Verificar E2E real y que las fuentes antiguas no se dupliquen, sin datos de contacto ni tokens en conversación.
