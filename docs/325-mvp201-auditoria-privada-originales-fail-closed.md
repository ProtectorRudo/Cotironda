# MVP201 — auditoría privada obligatoria antes de servir originales

**Estado: SOLO DESARROLLO.** Issue #525 / checklist #529. No se aplicó
ninguna migración en `cotironda-piloto`, no se publicaron rutas ni se
habilitaron banderas. No se afectaron `main`, producción ni WhatsApp.

## Problema encontrado

El descargador MVP190/MVP192 revalidaba autorización y SHA del archivo,
pero no dejaba una constancia persistente de cada preparación de respuesta
HTTP. La política de acceso a documentos identificables necesita un
registro verificable y una reacción segura ante una base no disponible.

## Cambio implementado

- `mvp201_original_download_audit_private.sql` crea una tabla privada
  con RLS y sin permisos de lectura/escritura para `anon`,
  `authenticated` o `service_role` directo. Guarda ronda,
  identificador opaco de original, comprador Auth, sesión, empresa
  verificada, SHA de fuente, tamaño y fecha de preparación de respuesta.
  **No** guarda números de WhatsApp, identidades de proveedores,
  contenido, rutas, HMAC, JWT ni direcciones IP.
- Una RPC `cotironda_piloto_record_original_download_mvp201`
  invocable **solo por service_role** vuelve a llamar al selector
  MVP192 en la misma transacción. Exige el documento exacto autorizado,
  SHA idéntico, bytes idénticos y sesión vigente antes de insertar.
- El camino HTTP PILOTO llama la RPC **después** de comprobar SHA
  del archivo y revalidar sesión, empresa, vínculo y consentimiento.
  Si falla el registro, **no entrega los bytes** (fail-closed, 503
  genérico). El servicio MVP190 genérico mantiene el hook opcional
  para no romper otros consumidores; en el adaptador PILOTO es obligatorio.
- La tabla registra `http_response_prepared`, **no** confirma que el
  navegador completó la transferencia. No confundir intentos autorizados
  con descargas recibidas.

## Pruebas

- Tests Node de auditoría exitosa, SHA y bytes exactos, falta de
  persistencia, error de base y prohibición de revelar datos internos.
- Extensión del smoke PostgreSQL 17 aislado MVP200: ACL de nueva RPC,
  inserción real, SHA erróneo, tamaño erróneo, documento ajeno y sesión
  revocada. Toda la prueba termina con `ROLLBACK`.
- Workflow PG17 ajustado para dispararse al modificar el SQL MVP201.

## Criterios pendientes antes de habilitar

1. CI exitoso, revisión de SQL y regresión de portal.
2. Instalación privada explícitamente autorizada de
   MVP178 → MVP191 → MVP192 → MVP201 con política inicialmente OFF.
3. Registro prospectivo y consentimiento genuino por proveedor,
   comprador verificado en Auth PILOTO y prueba E2E entre dos empresas.
4. Publicación explícita de Preview autorizada, rate-limit distribuido,
   procedimiento de retención y borrado del log y restore verificado.

La política de originales, el selector de finalistas y todos los
WhatsApps siguen apagados salvo las funciones ya existentes. Ninguna
migración de esta rama debe aplicarse retroactivamente.
