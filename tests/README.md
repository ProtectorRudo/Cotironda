# Etapa 01 — verificación

Ejecutar con Node >=22.16 y TypeScript disponible: `npm run test:unit` y `npm run typecheck`.

`supabase/schema.sql` es **schema declarativo**, NO una migración aplicada. El CLI Supabase no está disponible en el ambiente de edición; para convertirlo a migración, utilizar `supabase migration new initial_identity_catalog` en un entorno aislado y copiar el esquema revisado. Luego `supabase db reset` y `supabase test db`. **No ejecutar en bases de otros negocios.**

Los tests SQL de estructura todavía no demuestran aislamiento entre dos empresas. Agregar fixtures de autenticación y pruebas de SELECT/INSERT/UPDATE/DELETE ajenas antes de aprobar la Etapa 01. Ningún módulo está aprobado para uso real.
