# 105 — D042: age REAL, exclusivamente con datos sintéticos en CI

31/10/2026 · Issue #186 · PR draft sobre D041/#185.

## Qué resuelve

Las 15 pruebas D041 mockean el binario age. Eso valida la programación, pero no comprueba la interoperabilidad criptográfica. D042 agrega un sexto workflow independiente de seguridad sobre Ubuntu 24.04 para probar el recorrido completo con cinco archivos ficticios.

El runner instala age del repositorio oficial firmado de Ubuntu 24.04. Las pruebas no leen datos ni claves de la plataforma: crean dos identidades X25519 efímeras, cinco SQL diminutos totalmente ficticios (generados en memoria), los cifran mediante binario real en un directorio temporal privado 0700 y comprueban permisos 0600 de claves y archivos. No usa Supabase, Docker, conectores remotos, base de datos, WhatsApp ni OpenAI.

## Pruebas de aceptación

1. Generar dos pares X25519 efímeros con age-keygen; no imprimir sus claves fuera del runner.
2. Cifrar cinco ficheros ficticios por CLI age real, sin escribir SQL temporal en disco.
3. Sellar/verificar el paquete por D039/D040 con SHA-256 y permisos estrictos.
4. Ejecutar D041 con cinco descifrados REALES por age --decrypt. Stdout descifrado descartado y nunca escrito en disco.
5. Rechazar una clave privada equivocada.
6. Rechazar cabecera age falsa incluso si se vuelve a sellar el archivo y su SHA-256 coincide.
7. Rechazar ciphertext manipulado después del sellado.
8. Eliminar archivos y claves del runner aunque falle una prueba. No publicar artifacts ni hashes, keypairs, ciphertext o SQL en logs.
9. La salida siempre conserva real_dev_backup=false, restore_verified=false, gate_d024_open=false.

## Qué NO certifica

Este test NO restaura SQL, no confirma que los dumps reales de Supabase existan ni que incluyan Auth, Storage, Vault, triggers y datos. Aunque los seis workflows y age real estén verdes, Issue #175 y migraciones D024–D035 permanecen BLOQUEADOS hasta conseguir una copia auténtica cifrada, verificar su descifrado en el equipo responsable y restaurarla en entorno aislado sin cron/IA.

## Seguridad operativa

Workflow limitado a pull_request y workflow_dispatch, permisos contents:read, sin credenciales persistentes. Usa paquetes Ubuntu firmados; instalar age requiere acceso al repositorio APT, pero la prueba no hace llamadas externas. Exige CI=true y COTIRONDA_CI_REAL_AGE_SYNTHETIC=true; rechaza variables habituales de credenciales Supabase/OpenAI. No ejecutar esta prueba sintética para cifrar o restaurar respaldos reales; el procedimiento local D041 se mantiene separado.

Fuentes:
- https://filippo.io/age/
- https://packages.ubuntu.com/noble/age
- docs/104-local-age-preflight-d041.md
