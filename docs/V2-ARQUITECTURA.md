# V2 · Arquitectura y despliegue

## Modelo y seguridad

- `public.invitations`: grupo, revisión, fechas y revocación. `public.guests`: FK a invitación, nombre y respuesta individual, notas privadas y metadatos de respuesta.
- `private.invitation_credentials`: SHA-256 del token y copia cifrada AES-256-GCM. Token aleatorio de 256 bits, IV aleatorio por cifrado. No se persiste en claro. La copia cifrada es necesaria para recuperar el mismo enlace desde distintos dispositivos sin regenerarlo.
- El cifrado y HMAC usan claves separadas por contexto, derivadas de `WEDDING_INVITATION_SECRET` (si está configurado) o del secreto automático `SUPABASE_SERVICE_ROLE_KEY`, junto con `WEDDING_RATE_SALT`. No se necesita configurar un secreto nuevo para instalar esta V2 en el proyecto actual. No se envía la clave al navegador.
- **Rotación de secretos:** cambiar ese secreto de cifrado o la sal invalida la capacidad de recuperar los enlaces cifrados existentes y las pruebas. Antes de rotarlos, preparar la recodificación con la clave anterior o regenerar y redistribuir todos los enlaces. Rotar un token de invitación desde el panel no cambia estas claves.
- RLS: anon no puede leer invitados ni invitaciones; usuarios autenticados que no estén en `private.wedding_admins` no ven datos privados. Las mutaciones del panel pasan por RPC transaccionales con comprobación de administrador. No se acepta `user_metadata` como autorización.
- `resolve_invitation`, `submit_invitation_rsvp`, `consume_invitation_rate` y `confirmed_invitation` solo son ejecutables por service_role. La Edge pública elimina UUID internos y no devuelve notas, hashes ni ciphertext. Los selectores de miembros son aleatorios y se comprueba su pertenencia a la invitación dentro de la transacción.
- Bloqueo de la fila de invitación y revisión optimista evitan sobrescrituras concurrentes. Un request UUID y su payload hacen idempotentes los reintentos RSVP. Repetir la misma respuesta no aumenta su contador. La fecha límite se evalúa en el servidor, con zona argentina.
- Rate limit persistente: 240 solicitudes por conexión en ventanas de 15 minutos; incremento atómico y limpieza de ventanas anteriores a un día. Cuenta también tokens inválidos y peticiones rechazadas. No sustituye la protección de red del proveedor.

## Funciones

- `rsvp`: acciones `resolve`, `submit`, `validate`. `verify_jwt=false`: los invitados presentan token o prueba propios, no una sesión Supabase.
- `invitation-admin`: acciones `save`, `link`, `rotate`, `revoke`. JWT requerido; además consulta Auth y verifica la lista de administradores antes de acceder a las RPC.
- `guest-submit`: mantiene validación de archivos, reserva de cuota, consentimiento y moderación. V2 acepta prueba firmada de confirmación. El código global está deshabilitado por defecto; solo se admite con `WEDDING_ALLOW_LEGACY_CODE=true` durante una transición explícita. No es necesario borrar inmediatamente el secreto anterior.

`WEDDING_ALLOWED_ORIGINS` debe contener los orígenes reales sin barra final. Se conserva el dominio público y el origen GitHub Pages previamente autorizado. Las claves publicables viajan en `apikey`, nunca como Bearer; el panel usa el JWT del usuario.

## Migración

La producción partía de `guests` vacío y sin RSVP; NO ejecutar los archivos per-guest antiguos. Se movieron a `docs/archive/*.sql.disabled` como referencia histórica.

Aplicar únicamente `supabase/migrations/20260915032157_invitations_v2.sql` a esa base. No ejecutar `schema.sql` sobre producción; es una instalación nueva completa. La migración es transaccional y no elimina registros anteriores. Si hay invitados antiguos, los conserva con una invitación individual revocada por persona; requiere regenerar su enlace. No agrupa automáticamente apellidos ni pierde confirmaciones. Mantiene configuración, borrador, administradores, mensajes, archivos y Google Forms.

Orden: verificar estado y pruebas → aplicar migración V2 → desplegar `rsvp`, `invitation-admin`, `guest-submit` junto con `_shared/security.ts` → publicar `public/` en GitHub Pages → comprobar HTTP y flujo real. No ejecutar las migraciones antiguas de RSVP ni repetir el esquema completo.

Ante un fallo parcial, conservar la migración aditiva y corregir/replegar las Edge; no borrar las tablas nuevas ni respuestas. Restaurar el frontend anterior no restaura el panel antiguo de edición (se revocó escritura directa): recuperar la versión V2 corregida. Mantener el commit anterior y la versión de Edge como referencias, sin presentar una reversión destructiva como automática.

## Verificación

`npm ci`, `npm test`, `npm run check`, `npm run check:edge`, `git diff --check`.

Las pruebas de permisos, SQL y migración usan PGlite con auth/storage simulados. La integración Edge ejecuta los handlers TypeScript contra ese SQL, con HTTP simulado; incluye cifrado/recuperación, familia e individuo, confirmación parcial, reintentos, revisión, revocación, prueba expirada/manipulada y acceso a canciones sin código global. Las pruebas del cliente usan DOM; las de enlaces cubren Web Share y portapapeles. La comprobación simultánea en PGlite serializa consultas; la validación real de solicitudes concurrentes se hace por HTTP contra Supabase después de desplegar.

Los avisos del asesor sobre SECURITY DEFINER ejecutable por authenticated son esperables para RPC administrativas que comprueban `is_wedding_admin()`. Las tablas privadas con RLS y sin políticas están cerradas deliberadamente. No se crean políticas permisivas para silenciar esos avisos.
