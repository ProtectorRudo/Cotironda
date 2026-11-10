# Decisión 395 — MVP270: extracción privada de Storage para el ZIP del celular

Fecha: 06/11/2026. Autorización: «Luz verde», **desarrollo y pruebas únicamente**.

## Razón

MVP269 prepara un ZIP con seis piezas ya cifradas pero NO descarga archivos originales. Una copia de la base `storage.objects` **no contiene los bytes de PDFs, Excel o imágenes**. El PILOTO real tiene un bucket privado y seis objetos con 302.406 bytes declarados en metadatos, confirmados por SQL de solo lectura. Sin esa sexta pieza el ZIP no es recuperable.

## Entrega: nueva pieza de extracción

`scripts/ops/export-private-pilot-storage-mvp270.mjs` genera `storage_objects.tar.age` en una máquina POSIX de confianza. Usa **únicamente** el host fijado `https://ilggkalaafhtiysyzlmg.supabase.co`, recorre los buckets privados y las carpetas anidadas con paginación, descarga los archivos mediante el endpoint autenticado de Supabase Storage y escribe un TAR **directamente dentro de la tubería de cifrado age**. No genera PDF, Excel, imagen, tar o SQL en claro en disco.

Los nombres físicos del TAR son numéricos (`objects/000001.bin`...), de modo que no se revelan rutas comerciales fuera del ciphertext. El archivo `objects/index.json` se agrega **adentro del TAR cifrado**, con bucket y ruta original, tamaño, timestamp fuente y SHA-256 de cada objeto. Es esencial para una eventual restauración.

Se aplican límites prudentes: hasta 5.000 objetos, hasta 256 MiB acumulados y hasta 100 buckets. Si el piloto crece y llega al límite, falla explícitamente en vez de extraer parcial sin avisar. El sistema hace inventario antes y después de descargar, y **falla si cambian IDs, rutas, cantidades, tamaños o fechas**. Rechaza redirecciones HTTP, códigos no 200, rutas con componentes `..`, datos truncados y bytes extra, buckets públicos inesperados, archivos duplicados, credenciales vacías, carpeta de destino insegura y ruta del repositorio. Un archivo fallido no queda en el paquete.

El token `COTIRONDA_PILOT_SERVICE_ROLE_KEY` se obtiene del gestor de secretos en el host privado, no por parámetros de comando ni logs. El propio código impone URL de PILOTO, usa conexión HTTPS y no sigue redirecciones. El secreto no entra al proceso age, al archivo ni al resultado. El destinatario `COTIRONDA_AGE_RECIPIENT` debe corresponder a la identidad privada local `COTIRONDA_AGE_IDENTITY_FILE` comprobada con `age-keygen -y`. **Nunca pasar la clave privada a ChatGPT, GitHub ni Vercel.**

**Límites reconocidos:** una doble lectura del inventario no constituye una transacción serializable entre PostgreSQL y el servicio de objetos; no prueba que una copia se pueda restaurar ni que conserve bytes alterados durante una actualización concurrente que no cambie sus metadatos. El archivo no se puede considerar un respaldo completo de Supabase por sí mismo; faltan PostgreSQL, Auth, Vault, configuración, extensiones y restore aislado. La función devuelve `restore_verified:false`, `sql_included:false`, `mobile_zip_created:false`.

## Instalación y operación futura (NO ejecutada)

En un ejecutor privado Linux/macOS con Node22+, `age` y `age-keygen`, una carpeta vacía privada `0700` y una identidad local `0600`:

```bash
# Credenciales cargadas mediante gestor seguro; no pegar en consola compartida.
# COTIRONDA_PILOT_SERVICE_ROLE_KEY
# COTIRONDA_AGE_RECIPIENT
# COTIRONDA_AGE_IDENTITY_FILE
node scripts/ops/export-private-pilot-storage-mvp270.mjs /ruta/privada/piloto-cifrado
```

No se diseñó para ejecutarse en GitHub Actions, Vercel, Colab, navegador ni el propio teléfono; todos quedan bloqueados. Por ahora no hay una cuenta de operador Auth en el PILOTO ni un servidor privado aprobado que custodie credenciales, ejecute PostgreSQL y Storage y entregue un ZIP por HTTPS. **No existe un enlace de descarga**.

## Pruebas y aceptación

- Pruebas Node/CI **con fakes**; validan lectura de API, carpetas, tamaños, TAR, índice de hashes, detección de cambios y borrado tras fallas.
- La simulación de age en CI no es criptografía y no se usa fuera de los tests. Antes de extracción real, se exigirá una prueba con age verdadero y clave privada, su descifrado, SHA de la pieza y restauración de archivos en un entorno sin automatizaciones.
- Prohibido registrar mensajes reales, secretos, archivos y hashes individuales en GitHub Issues.
- Integrar la pieza **solo a desarrollo**, sin Supabase DDL, nuevas Edge, Vercel, WhatsApp, activación ni gastos externos.

## Qué falta para que el usuario lo descargue en su celular

1. Adaptar/exportar los cinco ficheros SQL consistentes desde `cotironda-piloto`, **sin reutilizar el exportador DEV atado a otra ref**.
2. Ejecutar exportación de SQL y Storage de verdad en un ejecutor confiable, cotejar recuentos y realizar restore aislado con identidad/clave recuperables.
3. Crear el ZIP MVP269, guardarlo cifrado en destino **externo** al proyecto original y entregar por autenticación fuerte y URL limitada al propietario. Probar la descarga con Android y comparar SHA-256. No exponer enlaces públicos o de vida larga.
4. Solo con restauración probada y permisos auditados, reconsiderar la publicación permanente de MVP256–267. El permiso «Publicalo» anterior no permite omitir el respaldo.

Referencias: https://supabase.com/docs/reference/javascript/storage-from-list · https://supabase.com/docs/reference/javascript/storage-from-download · `docs/394-mvp269-respaldo-zip-movil-cifrado-piloto.md`.
