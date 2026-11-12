# Acta 531 — MVP363 · Preparación auditada de aceptación real de originales (sin activación)

**Fecha:** 12/11/2026. **Instrucción:** «Avanza y registra en nuestro checklist y plan maestro».
**Alcance autorizado:** desarrollo, preflight real de SOLO LECTURA y documentación. **No publicación, no mensajes Whapi, no registro de consentimientos, no ronda nueva**.

## Resultado comprobado contra cotironda-piloto (SELECT, sin PII)

Consulta versionada: `supabase/tests/preflight/mvp363-originales-alta-readiness-readonly.sql`.
Se ejecutó la misma consulta en Supabase contra el proyecto PILOTO, el 12/11/2026:

| Control | Resultado |
| --- | --- |
| Usuarios Supabase Auth | 0 |
| Operadores habilitados | 0 |
| Consentimientos antiguos de originales vigentes | 0 |
| Política histórica de originales activa | 0 |
| Rondas `prepared` aún vigentes | 1 |
| Función MFA privada `operator_session_mvp267()` | Instalada |
| Ledger/política MVP362 | **NO instalado** |
| Dictamen | `NO_APTO_PARA_ALTA_REAL` |

El preflight **NUNCA** aprueba por sí solo una aceptación; incluso con precondiciones técnicas satisfechas devuelve que faltan evidencia y revisión. No consulta teléfonos, contenido de mensajes, hashes de chats, claves ni documentos; no escribe en la base.

## Diseño de registro real, todavía NO implementado

**Una sola autorización en el alta para rondas futuras**, no un sí por cada presupuesto.

1. **Condiciones aprobadas:** antes de presentar el consentimiento, el texto legal/comercial sobre originales *incluso de no adjudicados* debe ser aprobado, inmutable y versionado con SHA256 de UTF8. Aprobación y activación son distintas. Toda ronda anterior queda fuera. El borrador actual **no** representa aprobación.
2. **Entrega acreditable del texto:** registrar en canal WhatsApp del proveedor el mensaje saliente autenticado que contenga la versión y el texto exacto, su identificador/hmac, chat, fecha y huella. **Hueco detectado:** el MVP362 comprueba un mensaje entrante, pero aún no certifica una entrega determinada de las condiciones antes de esa aceptación.
3. **Aceptación explícita:** el proveedor responde afirmativamente a esa presentación en la conversación autenticada, con evidencia directa del mensaje (mensaje original, texto cifrado, SHA, remitente/chat, hora y referencia inequívoca a condiciones), sin inferirla de silencio, mero presupuesto, texto genérico ni IA. Se debe resolver ambigüedad antes de registrar. No pedir permiso adicional por cada ronda.
4. **Revisión de contenido segura:** operador habilitado en el proyecto PILOTO, con sesión Supabase Auth vigente y MFA AAL2, examina el texto *descifrado* en un entorno interno autorizado y comprueba intención y versión. Un hash idéntico solo acredita integridad de bytes, **no** intención contractual. El navegador nunca debe recibir claves de cifrado, `service_role`, archivos de terceros ni contenido de otros proveedores.
5. **Registro transaccional e inmutable:** un adaptador del servidor autorizado, sin operación pública genérica, revalida la sesión MFA y autorización, evidencia de entrega y de respuesta, identidad de proveedor, política activada, ventana temporal y ausencia de revocación/conflictos. Aporta al registro auditoría de operador, fechas y huellas sin conservar texto sin cifrar en un ledger accesible. Doble envío / reintento debe ser idempotente. **No insertar registros manuales antiguos por comodidad.**
6. **Revocación y reaceptación:** revocar bloquea todas las descargas futuras. El esquema M362 permite solo **un opt-in por (proveedor, versión)**: después de revocar, no permite reaceptar esa misma versión. Resolver explícitamente esta contradicción con la política («hasta nueva aceptación válida») antes de habilitar el alta real; preferir historial append-only de episodios + revocación por episodio y tests, sin resucitar rondas anteriores.
7. **Acceso comprador:** solo después del cierre real, sesión Auth buyer, empresa correcta, consentimiento prospectivo comprobado, original inmutable SHA y registro de descarga. El archivo de no ganadores puede incluir teléfono/CBU: esta decisión necesita aprobación comercial/legal, no puede inferirse de la participación.

## Bloqueos y aceptación

- [x] Reutilizar operador MFA MVP267 en el diseño, no construir otro sistema.
- [x] Verificar estado real solo lectura: 0 Auth / 0 operadores / 0 consentimiento, política OFF, M362 ausente, 1 prepared.
- [x] SQL de preflight versionado con dictamen fail-closed, ninguna escritura ni salida sensible.
- [x] Test Node de contrato de solo lectura y no-confusión entre precondiciones y consentimiento.
- [ ] Aprobar el texto legal y el alcance comercial de originales/no adjudicados.
- [ ] Crear prueba inmutable del **mensaje de condiciones enviado** y vincularla a respuesta expresa; asegurar que no se trate de respuesta a otra versión.
- [ ] Implementar vista privada de texto descifrado para operador MFA, autorización con sesión real y registro atómico protegido, más revocación/reaceptación sin retroactividad.
- [ ] Tests PG17 de API/custodia/enlaces/reintentos/fraude, CI completa, prueba real de un alta. Ninguna evidencia Whapi real fue generada.
- [ ] Auth Phone/OTP comprador, dos originales vinculados de una única ronda, seguimiento navegador/cierre/descarga, prueba `net` externa antes de cron. P0–P5 siguen ABIERTOS.

**Siguiente paso de desarrollo:** implementar el vínculo comprobable condiciones salientes → respuesta entrante y la revisión con MFA, sin activar permisos ni crear ronda superpuesta. Luego ensayar registro bajo condiciones aprobadas. **Solo `Publicalo en cotironda-piloto` habilita proponer una instalación controlada, sin desbloquear consentimiento automáticamente.**

Referencias: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #804](https://github.com/ProtectorRudo/Cotironda/pull/804), [plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [acta 530](530-mvp362-consentimiento-originales-una-vez.md).
