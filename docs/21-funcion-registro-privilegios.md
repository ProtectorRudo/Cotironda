# Alta mediante función privada — Auditoría de privilegios

**Problema comprobado:** antes de esta migración, `cotironda_app` tenía INSERT sobre `organizations`, `organization_members` y `supplier_profiles`. Aunque no tiene LOGIN aún, dar una credencial SQL a ese rol permitiría crear membresías arbitrarias.

**Solución en evaluación:** `cotironda_app` queda exclusivamente con permiso EXECUTE de la función privada `cotironda_private.register_company`. Los privilegios DML y las políticas RLS pasan a otro rol NOLOGIN, `cotironda_registrar`, que es dueño de esa única función. La función se convierte en `SECURITY DEFINER`, con `search_path = ''`, objetos referenciados con esquema explícito y sin privilegios `BYPASSRLS`. El propietario no es dueño de las tablas, por lo que RLS sigue aplicándose a sus escrituras.

### Riesgo residual relevante
El procedimiento recibe `p_user_id`; una credencial comprometida todavía podría invocarlo con cualquier usuario Auth existente. **No crear LOGIN ni habilitar la API** hasta comprobar cómo atar la identidad a una sesión Supabase Auth verificada y asegurar una tasa de solicitudes controlada. La separación de privilegios reduce el impacto de una intrusión, pero no sustituye autenticación.

### Criterios para aprobar
- Ejecutar pruebas de SQL en PostgreSQL aislado y Supabase `cotironda-dev` antes de modificar el entorno; asegurar rollback de fixtures.
- Comprobar rol nuevo sin LOGIN/BYPASSRLS/CREATE y cliente sin DML, además de que las inserciones sólo funcionan mediante el procedimiento.
- Revisar Supabase Advisors y asegurar que la función privada no está expuesta en PostgREST.
- Migración versionada y pruebas que se ejecuten en CI.
- `COTIRONDA_REGISTRATION_ENABLED=false` y ninguna credencial privada en Vercel. `cotironda.vercel.app` no cambia.

Guía de seguridad: https://supabase.com/docs/guides/database/functions y https://supabase.com/docs/guides/database/postgres/row-level-security

## Ejecución y verificación completadas (29-10-2026)
- **Tercera migración aplicada:** `20261029112947_execute_only_registration.sql` en Supabase `cotironda-dev`. Fuente versionada en GitHub: `supabase/migrations/20261029112947_execute_only_registration.sql`; hash idéntico al SQL revisado.
- CI PostgreSQL 17, RLS, idempotencia y pruebas de acceso: https://github.com/ProtectorRudo/Cotironda/actions/runs/40866084063 (**SUCCESS**).
- **79/79 pruebas unitarias**: https://github.com/ProtectorRudo/Cotironda/actions/runs/40866083948.
- Build Next.js + TypeScript + HTTP cerrado: https://github.com/ProtectorRudo/Cotironda/actions/runs/40866084052.
- Tests del sitio: https://github.com/ProtectorRudo/Cotironda/actions/runs/40866084000.
- Sobre Supabase real: primero probamos todos los cambios en transacción **ROLLBACK**, corregimos la transferencia de propiedad para su modelo de permisos, repetimos con éxito, aplicamos la migración y volvimos a ejecutar toda la suite en otra transacción revertida.
- Verificación posterior: `cotironda_app` NOLOGIN y sin INSERT de organizaciones/miembros; `cotironda_registrar` sin BYPASSRLS; cero empresas/miembros/altas ficticias; sin permisos temporales de `SET ROLE` sobrantes.
- Advisors: **sin alertas críticas**; INFO de esquema privado sin política y de índices sin uso por instancia sin tráfico.

### Advertencia de seguridad
Se usa deliberadamente una única función `SECURITY DEFINER` en esquema privado con propietario NOLOGIN, **no propietario de las tablas ni con BYPASSRLS**, políticas RLS específicas y `search_path` vacío. Cualquier ampliación de funciones, grants o exposición REST exige nueva revisión. Si una contraseña del backend se filtrara, se podría intentar invocar la función con `p_user_id` ajeno. **Por esa razón no se creó LOGIN ni se habilitó el registro.**

Siguiente paso: evaluar llamada RPC con identidad derivada del JWT autenticado y vinculada a la base sin permitir suplantación; probar correo verificado, cookies y rate limits reales. La función privada no debe exponerse en el esquema del Data API sin autorización explícita y auditada.
