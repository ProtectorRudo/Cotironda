# Registro de cambios

## [Sin publicar] — Etapa 00
- Diseño de producto, reglas de licitaciones, IA, mensajería, ranking y seguridad.
- Roadmap y criterios de prueba iniciales documentados.
- **No existe todavía una aplicación ni se han conectado servicios.**

## [Etapa 01 en desarrollo]
- Esquema SQL declarativo multiempresa y permisos RLS restrictivos (sin aplicación a bases).
- Selector de proveedores por producto confirmado, consentimiento y zona.
- Módulo de prevalidación de catálogos con confirmación humana, sin precios.
- Nuevo núcleo de registro y autorización de empresas: **24 tests nuevos ejecutados y aprobados**, TypeScript correcto.
- Pruebas SQL/pgTAP pendientes; no existe una BD Cotironda aislada ni se aplicaron migraciones.
- Pendiente: sesión auténtica, transacción persistente idempotente, UI y despliegue.

- GitHub Actions con 50/50 pruebas unitarias y estáticas correctas (ejecución 40833901535). Aún faltan pruebas reales SQL/RLS.
