## MVP-133 — validación de borradores documentales privados (03/11/2026)

La primera ejecución real y protegida del recuperador MVP132 alcanzó a la IA y devolvió `schema_rejected` para el original de 12.725 bytes. El SQL conservó estado `review_required` y no publicó cifras; quedaron 2 de 3 intentos consumidos. Se desactivó el cron hasta resolver el fallo, sin cambiar identidad, autorizaciones ni fuente.

La validación anterior rechazaba cualquier salto de línea y textos de más de 90 caracteres en condiciones, 250 en descripciones, 200 en evidencia; en un PDF real esas longitudes no son indicio de corrupción. Esta revisión permite borradores privados más amplios y conserva los caracteres originales. Sigue rechazando control NUL, tamaños desmesurados, estructura inválida y más de 25 renglones. Las puertas de corroboración independiente y publicación económica no se modifican. Ensayo sintético: notas multilínea, descripciones largas, celdas ilegibles y caracteres prohibidos.

Para continuar se requiere CI verde, despliegue únicamente al trabajador de recuperación en piloto, y probar el último intento restante sin habilitar bucles; el cron solo debe reactivarse cuando haya diagnóstico y un modo de controlar fallas. No se declara presupuesto extraído antes de verificarlo.
