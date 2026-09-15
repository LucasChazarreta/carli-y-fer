# Validación V2 · 15/09/2026

## Completado

- 44 pruebas automáticas aprobadas, incluidas SQL, migración con datos anteriores, handlers Edge, interfaz RSVP, panel y enlaces.
- `npm run check`, `npm run check:edge` y `git diff --check` aprobados.
- Migración incremental aplicada al proyecto real con versión `20260915032157`, nombre `invitations_v2`. Archivo local sincronizado con esa versión. Las migraciones RSVP antiguas no se ejecutaron.
- Funciones `rsvp` v1, `invitation-admin` v1 y `guest-submit` v5 desplegadas con sus dependencias. El endpoint administrativo requiere JWT y comprobación de administrador.
- Pruebas HTTP contra Supabase real: resolver familia sin UUID internos; confirmación parcial; reintento idempotente; prueba auténtica/manipulada; solicitudes concurrentes (200 y 409); todos rechazados invalidan prueba; lectura anónima de tablas denegada; endpoint administrativo sin JWT denegado.
- Datos de prueba temporales retirados. No se cargaron invitados reales.

## Pendiente por bloqueo de publicación

La revisión automática rechazó el push a GitHub al considerar que faltaba autorización explícita para publicación externa. La rama `work/invitations-v2` existe localmente, no en GitHub. El frontend público sigue en la versión anterior; la validación visual final V2 en el dominio queda pendiente. El navegador de revisión tampoco puede abrir el servidor local (`ERR_BLOCKED_BY_CLIENT`). La prueba del panel autenticado se realizó con DOM/HTTP simulado; no se inventó ni restableció una contraseña del administrador real.

**Estado de transición:** el backend V2 está activo, pero el frontend todavía es anterior. El formulario RSVP anterior y la escritura directa del panel anterior no son compatibles con V2. `guest-submit` exige la prueba V2 por defecto. Se intentó restaurar temporalmente el handler anterior para evitar ese desfase, pero la revisión automática lo rechazó por volver al código compartido. No se ejecutó esa restauración ni se intentó eludir el bloqueo.

Siguiente paso: con autorización explícita, subir la rama, revisar/fusionar o publicar en `main` y esperar GitHub Pages. El workflow ejecuta tests y comprobaciones antes de publicar `public/`. Después comprobar visualmente el flujo en el dominio y el panel real cuando haya sesión administradora disponible.

## Asesor Supabase

Se mantienen advertencias conocidas de funciones SECURITY DEFINER accesibles a usuarios autenticados; las RPC administrativas comprueban `is_wedding_admin()` internamente. Las tablas privadas tienen RLS sin políticas, deliberadamente cerradas. No se abrieron permisos para silenciar avisos.

La protección de contraseñas filtradas de Supabase Auth sigue deshabilitada (aviso preexistente); no se modificó la configuración de cuentas ni se activaron planes pagos. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
