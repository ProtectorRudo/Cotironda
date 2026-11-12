# Acta 530 — MVP362 · Originales: consentimiento al alta UNA VEZ y solo futuro

**Fecha:** 12/11/2026. **Instrucción:** «Avanza y registra en checklist/plan maestro». **Estado:** PR [#804](https://github.com/ProtectorRudo/Cotironda/pull/804), SOLO DESARROLLO. No hay publicación, SQL aplicado, Vercel, cuentas Auth nuevas, SMS ni WhatsApps enviados.

## Por qué esta etapa es necesaria

La regla comercial aprobada busca cero confirmaciones por cada presupuesto: el proveedor ya responde por WhatsApp y el comprador obtiene los archivos originales al cierre. Pero los PDFs/XLSX pueden incluir CUIT, teléfono, mail o datos bancarios y la autorización general para participar **no acredita permiso informado de revelarlos al comprador**. En el piloto la tabla de consentimientos de originales contiene **0 consentimientos vigentes** y la política está **OFF**; no se pueden atribuir permisos retroactivamente a Ailín, Nahuel u otros proveedores.

Además, `evaluarDescargaOriginalMvp161` rechazaba toda autorización aceptada ANTES de crear la ronda. Es correcto para el consentimiento específico legado, pero incompatible con la nueva regla de aceptación al incorporarse. El preflight M178 y catálogo original M360 tampoco contemplaban esa versión. Modificar solamente la tabla no basta.

## Contrato de producto, PROPUESTO (no publicado ni aprobado legalmente)

[Política de originales, BORRADOR v1](politica-originales-alta-v1-borrador.md):
- El proveedor acepta **expresamente UNA sola vez** la posibilidad de que el comprador autenticado descargue al cierre archivos fieles de sus cotizaciones, incluso ofertas parciales y **no adjudicadas**, los cuales pueden incluir datos identificables.
- Nunca compartir originales durante la ronda; mantener condiciones de contactos de ganadores, identidad oculta del arquitecto y trazabilidad de adjudicación, independientes de la descarga del propio PDF.
- Solo aplica a rondas creadas DESPUÉS de la publicación de la política y DESPUÉS de verificar y **registrar** la aceptación. No migrar consentimiento general/antiguas rondas y no tratar silencio ni envío de PDF como permiso.
- Revoques bloquean descargas futuras. Una versión de términos distinta requiere nueva aceptación. La revocación no puede retirar lo ya descargado.
- La aceptación puede recibirse al alta por canal verificable; no debe interrumpir las nuevas cotizaciones ni exigir responder «sí» en cada ronda.
- La redacción se debe revisar legal/comercialmente antes de activar. Registrar prueba explícita, no inventarla.

## Implementación exclusiva de desarrollo

1. `supabase/piloto/mvp362_originales_alta_consentimiento_off.sql`: política privada versionada `original_terms_policy_mvp362` (**sin filas**, `enabled=false` por defecto), texto canónico y su SHA verificado **en cada lectura**, aprobación y activación separadas; un registro por proveedor/versión de aceptación `supplier_original_optins_mvp362` con mensaje WhatsApp original, chat/participante, hash del texto aceptado y revisión de operador; ledger append-only `supplier_original_revocations_mvp362`. RLS y revocación de todos los roles de Data API, incl. `service_role` acceso directo. **La inserción no es RPC pública**: debe hacerse únicamente a través de un flujo de alta auditado, después de cotejar la aceptación explícita en claro por personal habilitado. Una firma o un simple mensaje recibido no basta.
2. Helper privado `original_effective_consent_mvp362(request,supplier)`: comprueba condiciones antiguas específicas por ronda OR onboarding explícito versionado, con política vigente antes de la ronda, aceptación/registro anteriores a la creación, proveedor no revocado, prueba inbox, chat, SHA del mensaje y contenido de términos, buyer activo y cierre. Una revocación global o específica de ronda bloquea ambas fuentes. Devuelve solamente tiempo y versión, sin contactos.
3. Reemplazo de `cotironda_piloto_original_consent_preflight_mvp178` **sin cambiar su firma** para usar la misma función privada.
4. Catálogo `mvp360_originals_from_verified_source_not_parser.sql` obtiene esa autorización por `JOIN LATERAL`; preserva todos los controles anteriores de Auth comprador, fuente documental/Whapi/SHA, actualizaciones/reemplazos, empresa y cierre. El JSON server-only informa la versión real.
5. `src/domain/descarga-originales-mvp161.ts` admite exactamente dos clases:
   - `cotironda-originales-v1`: aceptación en o después de creación de esta ronda, siempre antes de invitación y política.
   - `cotironda-originales-alta-v1`: aceptación ANTES de crear la ronda, siempre después de activar política y antes de invitación.
   - Cualquier versión ajena, aceptación tardía, usuario ajeno, consentimiento revocado, archivo adulterado o ronda abierta => rechazo.
6. Pruebas Node y PostgreSQL17 aisladas con rollback, incluyendo el propio fixture anterior M360 sin tablas económicas. No se usan credenciales reales ni Whapi.

### Advertencias de implementación

- **La evidencia de intención de aceptar términos no se deduce técnicamente de un hash.** El código cruza hash de contenido + mensaje y exige revisión explícita de un operador, pero la integración de revisión de texto cifrado/operador MFA se debe completar y auditar antes de permitir registro de consentimientos. No insertar filas en el piloto con mensajes ya existentes.
- No crear excepciones para invitados previos; r.created_at debe ser POSTERIOR a accepted_at **y** recorded_at.
- La política original M178 también sigue debiendo estar habilitada y activada ANTES de esa ronda, evitando saltar controles históricos.
- Las funciones de catálogo siguen siendo server-only. Una prueba DB exitosa no significa que Vercel/OTP SMS, firmas o Storage estén habilitados.
- El control REST real `net` de MVP359 no se verificó; es obligatorio antes de activar cron. Los secretos nunca se transportarán como llave admin en pg_net.
- Durante la transición, M360 modificado requiere la migración M362 instalada previamente; revisar cadena apilada #793–#804 y snapshot SQL antes de cualquier despliegue. No mezclar versiones.

## Checklist de salida

- [ ] PG17: tabla OFF/sin aceptación no da acceso; permiso legado sigue vigente con pruebas; onboarding prospectivo sí, PDF/XLSX sin V9; SHA términos/WhatsApp falsos NO; revocación NO; aceptación auditada demasiado tarde NO; retirada específica NO; ACL anon/auth NO; ROLLBACK.
- [ ] Node: función TS acepta versiones en sus ventanas precisas, rechaza permisos generales; catálogo y preflight comparten puerta única.
- [ ] CI general del SHA final: Next.js, Node, PostgREST Auth, aislamiento PG17 y sitio.
- [ ] Confirmación comercial/legal del texto de términos y revisión de la integración de aceptación / operador. Ninguna aceptación real aún.
- [ ] Auth comprador SMS/OTP, 2 consentimientos de proveedores en ronda NUEVA, 2 archivos originales asociados, seguimiento, cierre y descargas HTTP; P0–P5 **pendientes**.

**Próxima acción exacta para cualquier conversación:** certificar CI de [PR #804](https://github.com/ProtectorRudo/Cotironda/pull/804); después diseñar/verificar el registro de una aceptación explícita real en alta con autenticación de operador y revisión del contenido, SIN revincular PDFs ambiguos. En paralelo completar controles Phone/SMS/REST net. Solo bajo «Publicalo en cotironda-piloto» instalar gates OFF y efectuar la prueba auténtica. Fuente: [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan/Estado PR #796](https://github.com/ProtectorRudo/Cotironda/pull/796).

