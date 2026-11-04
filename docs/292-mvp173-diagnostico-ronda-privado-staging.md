# MVP173 — Ejecución real privada del diagnóstico de ronda (piloto)

**04/11/2026 · P0-B y #535 · rama de desarrollo apilada sobre MVP172/PR #547.**

## Qué cambia

Se conecta el selector privado MVP172 con el adaptador flexible mediante una Edge **separada, solo lectura**: \`cotironda-piloto-round-preview-staging\`. Su única ruta recibe el UUID de una ronda y, después de autenticar el token aleatorio de 96 caracteres de Vault (RPC interna MVP132), consulta \`cotironda_piloto_private_round_inputs_mvp172\` por \`service_role\`. No importa el recuperador, IA, Whapi ni lógica de cierre o ranking.

El diagnóstico toma los datos reales v9/MVP163/MVP168, pasa por \`diagnosticarRondaPrivadaMvp172\`, y devuelve **solamente** número de ofertas, artículos y conteos de estados de correspondencia. No responde con nombres, teléfonos, presupuestos, precios, hashes, IDs privados, textos originales ni documentos. Un error se devuelve como estado neutro, sin logs de contenido.

**El catálogo no se exige como formulario:** la comparación flexible reconoce alternativas comerciales de volumen y variante cuando se ha acreditado su familia y presentación, y deja sin clasificar los otros rubros hasta comprobarlos. Una alternativa no es garantía de stock ni identidad técnica exacta.

## Seguridad

- Token enviado desde PostgreSQL/Vault sin devolver su valor en herramientas, logs ni respuestas.
- Header obligatorio, POST obligatorio, JSON estricto \`{"requestId":"UUID"}\` y cuerpo <=64 bytes. Solicitudes no autorizadas 401, forma inválida 400, fuente incompleta 409.
- La SQL MVP172 queda en \`public\` únicamente por requerir \`rpc\` de Supabase con \`search_path=''\`; EXECUTE revocado a PUBLIC/anon/authenticated, concedido solo a service_role. Auditoría SQL PG17 de ACL, revocación, no filtración y fuente v9.
- Esta función NO es portal público, no corre con cron y no altera la recuperación productiva del piloto.
- Sin totales finales cuando no se acreditan IVA, flete y stock; ranking, adjudicación, contacto y envío a proveedor false.

## Criterios de aceptación

1. 14 pruebas unitarias MVP173 de autenticación, JSON estricto, límites, ausencia de filtración, falla cerrada, excepciones y consentimiento indirecto SQL.
2. Deno check de entrypoint completo y CI de Next, PostgreSQL y PostgREST.
3. Después de aprobar CI, antes de habilitar en piloto: instalar selectora SQL aditiva y aislada (ya probada con BEGIN/ROLLBACK), comprobar grants sin permisos públicos, desplegar worker de staging con \`verify_jwt=false\` **solo porque se valida token Vault primero**, sin cron; no publicar el recuperador habitual.
4. Prueba sin token: HTTP 401, no tablas nuevas ni mensajes.
5. Invocar desde pg_net por lote de ronda pero una por llamada, dejando el secreto dentro de Vault, con resultado agregado sin PII.
6. Confirmar 4 documentos originales preservados, 0 activaciones/outbox, \`main\` sin cambios. Si la lectura real falla, no afirmar E2E.

## Limitaciones y próximo paso

El parser de evidencia comercial MVP170 está especializado inicialmente en áridos. Cemento, hidrófugos y electricidad exigen cotejo adicional de atributos y cantidades; el resultado \`no_aplica\` NO es prueba de incompatibilidad. No afirmar que estas ofertas estén comparadas totalmente ni recomendarlas por precio. En el portal se deberán mostrar todas las cotizaciones y sus alternativas, con los originales descargables cuando la regla de consentimiento y cierre lo autorice.

**Evidencia a completar tras prueba real:** URL y SHA PR, CI, versión de Edge, HTTP 401/200 y conteos, comparación con queries de solo lectura y resguardo del estado.
