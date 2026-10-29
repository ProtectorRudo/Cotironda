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
