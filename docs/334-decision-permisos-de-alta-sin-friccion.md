# Decisión comercial — autorizaciones al alta, sin repreguntar cada cotización

**05/11/2026 — propuesta de implementación futura, no activada**.
Usuario aprobó orientar Cotironda hacia una experiencia donde las
autorizaciones necesarias se acepten al **ingresar a la plataforma**
en lugar de exigir un formulario en cada ronda.

## Política de producto

- **Una sola aceptación comprensible de condiciones** por cada comprador
  y proveedor, con fecha, versión, registro verificable y posibilidad
  de revocación, antes de iniciar sus primeras operaciones.
- Esa aceptación puede cubrir **participación en rondas, procesamiento
  documental por IA, envío y recepción de cotizaciones por WhatsApp,
  almacenamiento de presupuestos y exhibición de ofertas al comprador**,
  explicando el flujo con lenguaje corriente.
- El comprador conserva acceso a **todas las propuestas recibidas**
  (incluidas las parciales), no solo a los dos recomendados. Cotironda
  no adjudica ni obliga a contratar a los seleccionados.
- Si la política se extiende a **compartir originales identificables
  o revelar contactos después del cierre**, esas consecuencias tienen
  que figurar explícita y destacadamente en lo que el proveedor acepta
  al alta. La adhesión al servicio por sí sola no prueba que haya
  aceptado retroactivamente cada alcance de una nueva versión.
- Nunca se comparten números o información entre empresas no
  relacionadas, ni identidades antes del plazo, ni archivos de
  participantes que no aceptaron las condiciones aplicables.
- Sin reconfirmación por cada presupuesto **si la aceptación vigente
  y suficientemente específica ya cubre esa acción**. Los cambios
  sustanciales de permisos requieren nueva aceptación informada.
- Si el proveedor revoca o sale, se respetan las condiciones de
  revocación, la conservación mínima para auditoría y el acceso
  legítimo al historial, sin abrir acceso adicional.
- Los registros existentes anteriores a esta política **no se
  consideran consentidos automáticamente** para nuevas divulgaciones.

## Impacto técnico y criterios de aceptación (pendiente de implementar)

1. Crear un registro de aceptación por empresa/participante con
   versión, alcance, fecha, evento verificable y revocación. Nunca
   deducir autorización del simple hecho de que exista un teléfono.
2. Integrarlo al alta de usuarios/proveedores y al proceso de
   vinculación por WhatsApp, con explicación breve y sin múltiples
   pantallas. Evitar autoregistro de identidades ajenas.
3. El guardián de originales MVP178/MVP192 y el de contactos MVP109
   podrán consultar esa aceptación **prospectiva** como permiso
   reutilizable para rondas NUEVAS. No eliminar comprobaciones de
   sesión, empresa, fecha de cierre, documento vigente y SHA.
4. Pruebas: usuario con aceptación nueva; versión anterior insuficiente,
   exclusión antes del alta, opt-out, empresa distinta, archivo
   histórico, enlace compartido y sesión vencida.
5. Actualizar textos públicos y políticas legales antes de publicar;
   revisar correspondencia con Ley 25.326 y normas aplicables a
   tratamiento y comunicación de datos personales en Argentina.

**No hay migración ni consentimiento automático** en este documento.
La implementación deberá cerrar la fricción sin sacrificar la
autorización verificable de datos identificables. No bloquear el
desarrollo de ranking, cierre ni IA por esta decisión.
