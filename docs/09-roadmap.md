# 09 — Hoja de ruta y puertas de calidad

**Estado auditado 29/10/2026:** Etapa 00 documentada; Etapa 01 en PR apilados hasta #48. Seven migraciones aplicadas solamente en `cotironda-dev`, registro SQL y portal comercial cerrados. El Auth Hook está ACTIVADO en desarrollo y el propietario probó un JWT real desde Chrome con cuentas de ensayo; CI de PostgreSQL, Next y SSR/HTTP aprobado sobre datos simulados. **La migración 8 de Storage privado está en PR #52, aún sin interfaz ni análisis antimalware** (la auditoría inicial encontró 0 buckets en dev); falta un ensayo real de revocación JWT, prueba HTTP 429 auténtica controlada y consolidación de PR. El dominio comprado `cotironda.com` está registrado en Hostinger pero NO apunta a Vercel; su configuración se programa en la puerta de publicación. Ver `docs/38-dominio-hostinger-vercel.md` y `docs/39-storage-privado-pendiente.md`.

| Etapa | Entregable | Criterio de aprobación |
| --- | --- | --- |
| 00 Documentación | Visión, reglas, arquitectura, pruebas, decisiones, riesgos | Documentos coherentes, abiertos registrados y revisión comercial |
| 01 Usuarios y base | Organizaciones, roles, rubros, catálogos, zonas, Storage privado | Autorización cruzada y RLS probadas con varias empresas |
| 02 IA documental | Extracción por archivo, trazabilidad, aclaraciones y confirmación | Corpus realista y casos extremos aprobados |
| 03 Licitaciones | Rondas, invitaciones, ofertas versionadas, rankings y adjudicación | Matemática determinista y casos parciales aprobados |
| 04 WhatsApp | Adaptador Whapi, webhooks, IA conversacional, colas y opt-out | Ciclo real probado con números autorizados, sin duplicados |
| 05 UX | Portales comprador/proveedor/admin, móvil y escritorio | Flujos completos usables, pruebas end-to-end |
| 06 Pagos y protección | Suscripciones, webhooks, gastos, auditoría, backups | Pagos idempotentes y restauración/pruebas de seguridad |
| 07 Piloto | Primeros compradores y proveedores voluntarios | Rondas completas, costos medidos y retroalimentación |

## Secuencia profesional por Issue
Inspección de situación actual → impacto y aceptación → rama → implementar → pruebas → auditoría → PR → revisión → merge → producción sólo autorizada.

## Prioridad
Primero flujo pequeño con datos sintéticos. Activar WhatsApp real cuando base y autorización ya sean seguras. No optimizar por número de pantallas: optimizar por ronda de cotización completa y confiable.

### Desarrollo paralelo de interfaz (sin desplegar backend)
Se creó el PR #8, apilado sobre el PR #4: portal Next.js para alta de empresas e inicio de sesión, preparado para Supabase Auth. Pasó build de Next.js y los tests HTTP/SQL, pero queda **inactivo** hasta configurar las credenciales de aplicación y completar pruebas E2E con sesión real. La base Supabase dedicada y la migración ya existen. La etapa 01 continúa abierta.

### Auditoría de identidad (29/10/2026)
La quinta migración aplicada a `cotironda-dev` movió el privilegio de la RPC pública a una función privada, eliminando la advertencia WARN. Se exige claim de correo confirmado emitido por Auth Hook basado en `auth.users` y la cerradura BD sigue `false`. La Etapa 01 **no está cerrada**: el Hook ya fue habilitado y se probó JWT real mediante Chrome; siguen pendientes Storage privado, JWT revocado real, 429 HTTP remoto y pruebas del portal completo con Auth real. Ver `docs/23-hook-correo-auditoria.md`.
