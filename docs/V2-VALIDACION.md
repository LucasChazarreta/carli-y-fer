# Validación V2 · 15/09/2026

## Completado

- 44 pruebas automáticas aprobadas, incluidas SQL, migración con datos anteriores, handlers Edge, interfaz RSVP, panel y enlaces.
- `npm run check`, `npm run check:edge` y `git diff --check` aprobados.
- Migración incremental aplicada al proyecto real con versión `20260915032157`, nombre `invitations_v2`. Archivo local sincronizado con esa versión. Las migraciones RSVP antiguas no se ejecutaron.
- Funciones `rsvp` v1, `invitation-admin` v1 y `guest-submit` v5 desplegadas con sus dependencias. El endpoint administrativo requiere JWT y comprobación de administrador.
- Pruebas HTTP contra Supabase real: resolver familia sin UUID internos; confirmación parcial; reintento idempotente; prueba auténtica/manipulada; solicitudes concurrentes (200 y 409); todos rechazados invalidan prueba; lectura anónima de tablas denegada; endpoint administrativo sin JWT denegado.
- Datos de prueba temporales retirados. No se cargaron invitados reales.

## Publicación y prueba en navegador

- Publicación autorizada expresamente por el propietario. [PR #7](https://github.com/LucasChazarreta/carli-y-fer/pull/7) integrada en `main`, commit `f0fe77bb3a25ed5a46d31ccf6d6fd2d1ca4d93ed`.
- [GitHub Pages: despliegue aprobado](https://github.com/LucasChazarreta/carli-y-fer/actions/runs/34925660073), incluidas las pruebas y comprobaciones del workflow. Frontend y backend V2 activos conjuntamente en https://boda-carli-fer.agentslucca.online/.
- Navegador real: apertura de carta, música iniciada por interacción y página general que solicita el enlace personal para confirmar.
- Invitación temporal de dos personas: una confirmada y otra pendiente; guardado comprobado en Supabase con contadores 1 y 0; redirección a `/confirmados/`, acceso validado y enlaces de canción, mensaje y QR público sin credenciales.
- Canción enviada desde el formulario real, recibida en Supabase como sugerencia privada. Álbum enlazado al formulario de Google existente sin pedir el código anterior.
- Invitación, personas y canción de prueba eliminadas al terminar; comprobado el rechazo posterior de la prueba de confirmación.
- Acceso público del panel verificado en navegador. La creación, edición, recuperación de enlaces, revocación y regeneración del panel están cubiertas por las pruebas DOM/Edge/SQL.

## Límites de la validación y datos pendientes

No había una sesión administradora disponible para recorrer el panel autenticado en el navegador real; no se inventó ni restableció la contraseña de la cuenta existente. La inspección visual se realizó en el navegador de escritorio disponible; no sustituye una prueba en dispositivos físicos.

La pareja aún debe cargar sus invitados y completar alias/titular, vestimenta, WhatsApp y direcciones textuales según corresponda. El flyer continúa como entrega posterior acordada. El cierre efectivo del formulario externo depende de Google Forms, como se explica en `V2-OPERACION.md`.

## Asesor Supabase

Se mantienen advertencias conocidas de funciones SECURITY DEFINER accesibles a usuarios autenticados; las RPC administrativas comprueban `is_wedding_admin()` internamente. Las tablas privadas tienen RLS sin políticas, deliberadamente cerradas. No se abrieron permisos para silenciar avisos.

La protección de contraseñas filtradas de Supabase Auth sigue deshabilitada (aviso preexistente); no se modificó la configuración de cuentas ni se activaron planes pagos. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
