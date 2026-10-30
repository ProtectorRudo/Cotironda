# 54 — Preflight de credenciales E2E Auth: aislamiento, no reutilización, Node 22

**Etapa 01 · 29/10/2026 · Issue #82 · PR en borrador.**

## Motivo

Se detectó que el diagnóstico manual de `cotironda-dev` permitía usar **la misma contraseña para las dos cuentas de ensayo**, y las instrucciones recomendaban ejecutar directamente `node scripts/auth-real-smoke.mjs`, aunque el runner importa archivos TypeScript con Node 22.16 (en CI usa `--experimental-strip-types`). Además, el fallo de SDK se imprimía como mensaje externo sin una lista blanca, con riesgo de reflejar valores sensibles si el servidor o el transporte incluyera detalles.

**Regla:** ninguna contraseña enviada en chat, capturas, Issues o PR debe reutilizarse para iniciar sesión. Si se expuso un secreto compartido, se deben **rotar las contraseñas de ambas cuentas**, con valores nuevos, únicos y no pegarlos en mensajes. Este cambio no guarda ni usa el secreto expuesto.

## Controles implementados

1. `validarEntornoE2E` sigue exigiendo URL y ref exactas de `cotironda-dev`, clave `sb_publishable_`, bandera `COTIRONDA_E2E_ALLOW_AUTH_REQUESTS=true` y dos correos de ensayo diferentes; ahora exige contraseñas de **al menos 12 caracteres y distintas entre sí**, sin imprimirlas.
2. El runner de Auth genuino **se niega a ejecutarse si `GITHUB_ACTIONS=true`, `CI=true` o `VERCEL=1`**. No se introducen secrets en GitHub Actions ni se permite que una prueba que dispara signOut global opere en infraestructura compartida.
3. El comando oficial local desde `apps/portal` es `npm run e2e:auth:dev`. Usa `node --experimental-strip-types scripts/auth-real-smoke.mjs` para permitir importación de módulos `.ts` con Node 22.16, la misma versión fijada en CI.
4. `codigoSeguroE2E` permite imprimir únicamente códigos de error predefinidos por Cotironda. Cualquier error ajeno (SDK, red, servidor) se reduce a `fallo_e2e_revisar_entorno_privado`; **nunca** se vuelca el mensaje externo. Las credenciales permanecen exclusivamente en variables de entorno locales.
5. `.github/workflows/portal-ci.yml` ejecuta el **mismo comando** pero con bandera GitHub Actions: espera la negativa `auth_e2e_entorno_remoto_bloqueado` y falla si el script por accidente llegara a iniciar Auth. El log temporal se elimina; no se conectan cuentas reales.
6. `tests/unit/auth-e2e-preflight.test.mjs` cubre cuentas distintas, contraseñas duplicadas, demasiado cortas, negativas de ejecución remota y sanitización de mensajes que contienen valores ficticios.

## Cómo completar el ensayo real, SIN compartir secretos

- Cambiar las dos contraseñas previamente reutilizadas desde el panel de Auth de **cotironda-dev** o por recuperación de las cuentas de ensayo. Elegir valores *diferentes*, nuevos y robustos, nunca reutilizados en otro sistema. No almacenar en GitHub, Vercel, captura de pantalla, Issue ni conversación.
- En un equipo privado con Node 22.16 y `npm ci --ignore-scripts`, configurar las variables de entorno locales descritas en [docs/24](24-auth-e2e-seguridad.md) y [docs/52](52-auth-real-revoked-catalog-e2e.md), sin imprimirlas.
- Desde `apps/portal` ejecutar `npm run e2e:auth:dev`; el script opera con cuentas **exclusivas de ensayo**, solicita logout global al finalizar e informa códigos/nombres PASS/FAIL. No ejecutarlo en cuentas personales o comerciales.
- Comprobar la base por consultas SQL de solo lectura, que el registro sigue deshabilitado y no aparecen empresas ni archivos.

## Criterios y límites

- La CI comprueba los preflight y los contratos del SDK, **no** introduce credenciales de ensayo reales. El E2E con JWT genuino después de logout de Issue #78 sigue **sin ejecutarse** por este PR.
- No se modifican Supabase Auth, contraseñas de usuarios, sesiones, SQL, migraciones, Storage, DNS/Hostinger, Vercel ni producción.
- La warning de protección de contraseñas filtradas permanece pendiente de decisión sobre el plan; el preflight no reemplaza ese control ni justifica activar registro.
- Los PRs siguen apilados y en borrador; sin `Publicalo` no realizar integración/despliegue.

**Evidencia de tests CI y commit final:** registrar solo después de verificación real de los cinco workflows.
