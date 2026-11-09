# Decisión 461 — MVP330: puente privado Supabase Auth → ticket → cotejo

**Fecha:** 09/11/2026 (ART). **Autorización:** «Luz verde» para desarrollar/probar/documentar; no publicar Supabase/Vercel/WhatsApp, no activar cron ni envíos.

## Alcance

En la rama de desarrollo se agrega servicio-operador-conciliacion-mvp330.ts, un **módulo interno** que conecta verificación remota con Supabase Auth (getUser usando JWT original), emisión autenticada de ticket SQL MVP329, carga exclusiva servidor de propuesta, claim de un solo uso service_role y custodia/evaluación MVP328/MVP327. No existe un endpoint HTTP nuevo ni operador real. Este avance NO acredita la respuesta histórica de Nahuel.

El contrato admite únicamente JWT + ID de ronda + HMAC de mensaje y chat. Rechaza input de propuesta, monto, operador, empresa, banderas de aprobación, metadata o ticket. Exige modo seguro del worker y AES-GCM no exportable. Si falla identidad, MFA AAL2, sesión, grant empresarial, fuente, ticket de 90 segundos o carga privada, el flujo falla cerrado. La autorización final por empresa/MFA corresponde a SQL MVP267/MVP329, no a un claim editable del JWT.

El worker devuelve solo estado seguro y contadores de 0 mensajes/0 IA; nunca original, proveedor, contacto, precio, clave, JWT o token. MVP328 agrega un registro privado de intento inmutable sin convertir estado review a verified, autorizar publicación, adjudicar ni revelar identidades.

## Dependencias pendientes

- Construir el adaptador real exclusivamente servidor que instancie cliente Auth getUser(JWT), una RPC authenticated **con el mismo JWT y nunca service_role**, y otro cliente service_role restringido al worker. No añadir credenciales a navegador/HTML/repositorio. No hay HTTP para invocar todavía.
- Construir cargador privado de propuestas comerciales con procedencia comprobada (renglones/equivalencia/fuente). Este módulo **no recibe propuestas económicas del usuario** y no incluye su creación automática. Si no existe, denegar.
- Enrolar manualmente operador real con MFA y grant específico empresa/ronda, revisar revocación real y repetir pruebas JWT firmados. El piloto hoy tiene 0 Auth users/operadores (consulta real del 09/11).
- MVP328/MVP329 siguen solo desarrollo, no instalados en piloto. Falta preflight, plan de recuperación, publicación expresa «Publicalo» y test HTTP/E2E real con usuario/empresa ficticia.
- Futuro evento humano independiente, auditable y versionado, antes de promover cotizaciones en revisión; ninguna promoción automática a partir de este módulo.

## Pruebas y límites

La suite tests/unit/mvp330-private-operator-bridge.test.mjs incluye cadena Auth→JWT→issue→carga privada→claim→AES→registro y casos de JWT inválido, permisos/factor ausentes, propuesta alterada o de otra ronda, reuso/denegación de ticket, versión de fuente, salida sin PII, cero WhatsApps y cero OpenAI. CI Node 22 y regresiones MVP327–329 con datos sintéticos, sin Supabase real. **Los mocks no prueban la firma JWT ni MFA real**.

La conciliación operativa es ruta excepcional y **no es el camino crítico** del piloto normal. El circuito normal aún requiere Whapi vigente o alternativa real, activación segura del autodespacho, presupuestos acreditados, vista preliminar y cierre/revelado de proveedores, además de E2E desde un teléfono. Issue #726 permanece abierto.
