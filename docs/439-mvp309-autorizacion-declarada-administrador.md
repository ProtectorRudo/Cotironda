# Decisión 439 — MVP309: autorización previa declarada por administrador, sin repreguntas

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde». **Estado:** código en desarrollo, NO publicado, sin cambios en Supabase real.

## Regla principal del responsable

Cuando el responsable de Cotironda solicita incorporar a una persona como comprador o proveedor, declara que ya obtuvo previamente su autorización para participar en Cotironda y las actividades propias de su rol. No se envían mensajes de permiso adicionales ni por alta ni por ronda. **La declaración administrativa se registra una sola vez**, de forma privada, con participante, rol, finalidad, versión de condiciones, origen declarado, fecha y cuenta técnica que efectuó la registración.

Para los dos proveedores de prueba Ailín y Nahuel existe una declaración verbal previa comunicada al responsable. No transformar esa declaración en una respuesta WhatsApp o una firma inexistente. El alta y la verificación técnica de su contacto son procesos diferentes.

## Diseño de mínimo riesgo

La migración `mvp309_declaracion_admin_autorizacion_previa.sql` agrega:

- `admin_authorizations_mvp309`: constancia administrativa **inmutable** individual, vinculada al participante existente, su rol real y una finalidad explícita. Para comprador: uso estándar, nunca divulgación del contacto personal. Para proveedor: participación y divulgación de su WhatsApp **comercial** al comprador de la ronda, al cierre. El texto de política asociado se hashea para trazabilidad; esto **no** afirma que el titular firmó dicho texto.
- `admin_authorization_revocations_mvp309`: revocación individual **inmutable**, prevalece incluso si un operador intenta repetir la declaración.
- `admin_record_permission_mvp309` y `admin_revoke_permission_mvp309`: funciones `SECURITY INVOKER` **solo para sesión `postgres` real en SQL Editor**, sin permisos `PUBLIC`, `anon`, `authenticated` ni `service_role`. El operador indica a qué instrucción de alta corresponde la declaración; no puede cambiar el rol del usuario y no puede registrar automáticamente a todo el padrón.
- `proveedor_contactable_mvp307` conserva sin cambios el camino de consentimiento WhatsApp verificable y acepta, como segunda fuente identificada, una constancia individual del administrador **solo cuando** existe contacto cifrado previamente vinculado a un mensaje WhatsApp autenticado, rol `supplier`, no hay baja ni revocación y la ronda habilita mostrar el contacto comercial. La función nunca devuelve el teléfono a SQL público; las barreras de cierre, token y comprador real siguen aplicando en MVP303/304.

**Es una declaración del administrador, no prueba independiente de consentimiento firmado por el titular.** Para personas físicas cuyos teléfonos se consideran datos personales, la ley argentina 25.326, artículos 5, 6 y 11, exige una base válida y prueba adecuada según las circunstancias. Antes de usar la atestación para divulgar teléfonos reales debe revisarse la suficiencia de la evidencia y el aviso dado al titular; el sistema evita pedir mensajes reiterados pero no elimina obligaciones legales: https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto

## Alta nueva sin fricción: límites actuales del PILOTO

El piloto histórico `mvp072_runtime_aislado.sql` restringe la tabla `participants` a las tres claves de prueba, y otros contratos de ronda contienen identificadores de prueba. **MVP309 no abre autorregistro, no desactiva esas restricciones y no inventa teléfonos o HMAC.** La constancia solo se guarda para participantes ya creados bajo un procedimiento de alta válido. Un participante sin canal WhatsApp cifrado y verificado permanece no contactable, aunque el responsable haya declarado que autorizó su incorporación. La generalización para múltiples nuevos usuarios requiere una migración de identidad y ruteo por empresa aparte, con pruebas de aislamiento y costos.

## Criterios de aceptación

1. Se registra exactamente **una** constancia administrativa por participante, con rol y alcance correctos, sin que nadie escriba `COTI CONTACTOS SI` por obligación adicional.
2. Un proveedor de prueba con número verificado pero sin aceptación WhatsApp directa puede resultar contactable **solo** por una declaración individual y vigente del responsable con finalidad comercial registrada.
3. Un comprador nunca recibe alcance de contacto de proveedor; su teléfono y documentos originales nunca se revelan.
4. Baja, revocación desde WhatsApp o revocación del administrador prevalecen. No reactivar automáticamente registros revocados.
5. Ni un usuario anónimo, ni una sesión de usuario web, ni una Edge Function con `service_role` pueden crear declaraciones administrativas. No se modifica `enrollment_terms_proof_mvp308` ni se introducen mensajes WhatsApp ficticios.
6. Ensayo PostgreSQL17 con datos sintéticos y `ROLLBACK`, pruebas Node de contrato, y CI GitHub completos. **Sin publicación, envíos, activación de gate ni actualización del piloto** con esta «Luz verde».

## Relación con actas anteriores

[436](436-politica-autorizacion-unica-al-incorporarse.md), [437](437-mvp308-autorizacion-unica-por-rol-y-privacidad.md) y [438](438-mvp306-308-publicacion-verificada-piloto-v70.md). La v70 publicada permanece intacta; MVP309 es posterior y pendiente de una eventual orden «Publicalo».
