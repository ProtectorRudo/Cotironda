# 07 — Seguridad, privacidad y autorizaciones

## Amenazas
Acceso cruzado entre empresas; filtración de identidad/contacto antes de adjudicación; documentos expuestos por URL; webhook duplicado o falso; manipulación de ofertas vía mensajes; prompt injection en adjuntos; secretos en frontend o GitHub público.

## Controles obligatorios
- Usuarios asociados a organización. Autorizar por organización, rol, invitación y etapa de licitación **en servidor y base de datos**.
- RLS en todas las tablas expuestas, políticas concretas por recurso, pruebas de acceso entre compañías.
- Storage privado, URLs firmadas breves, validación de contenido/tamaño/extensión de archivo.
- Información económica y datos del proveedor segregados. Frente al comprador, alias e información permitida hasta la adjudicación; proveedores jamás leen ofertas de otros.
- Registrar de forma auditable cambios de precios, confirmación, invitación, cierre, adjudicación, revelación de contacto y revocación de acceso.
- Secretos en gestores de entorno, nunca en navegador, repositorio, logs o chat.
- Verificación de autenticidad y deduplicación de webhooks; rate limits, prevención de abuso y controles de consentimiento.
- Política de retención, eliminación y copias de seguridad; probar restauración antes de piloto.

## Matriz mínima de accesos (pruebas)
1. Comprador A no puede ver ni editar solicitudes de comprador B.
2. Proveedor no invitado no puede consultar licitación privada.
3. Proveedor invitado solo ve líneas asignadas, su propia oferta y información pública permitida.
4. Comprador no ve identidad/contacto antes de adjudicar conforme a política vigente.
5. Ganador ve contacto tras confirmación; no ganador no.
6. Administradores sólo acceden por rutas autorizadas y auditadas.

## Repositorio público
Este repositorio es público por decisión del propietario. Documentar criterios y código, **nunca** datos de clientes, listas de precios reales, credenciales, tokens, chats, teléfonos ni presupuestos concretos.
