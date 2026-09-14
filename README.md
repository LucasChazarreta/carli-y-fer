# Carli y Fer · Invitación de boda

Primera implementación basada en las cuatro páginas de la respuesta de los novios. Boda: 17/10/2026, Santiago del Estero. Ceremonia 21:00, fiesta 22:00. Invitación botánica blanca y verde, sin fotografías de la pareja.

**Estado al 14/09/2026:** frontend conectado al proyecto Supabase real; base, administrador, Edge Function y Google Forms configurados. Maps está asignado exclusivamente a Finca La Sureña. El repositorio de publicación es `LucasChazarreta/carli-y-fer`; falta habilitar GitHub Pages y completar la validación del dominio durante la propagación DNS.

## Abrir y publicar

Ver `docs/GUIA-PUESTA-EN-MARCHA.md`, `docs/DOMINIO-HOSTINGER.md` y `docs/ALBUM-GOOGLE-DRIVE.md`. La vista previa independiente que acompaña el proyecto se abre con doble clic. Para ejecutar los archivos originales localmente, abrir una terminal dentro de esta carpeta y usar `python -m http.server 8080 --directory public`; entrar a `http://localhost:8080`. Node no hace falta para servir la invitación.

## Organización

| Ubicación | Responsabilidad |
|---|---|
| `public/index.html`, `styles.css`, `app.js` | Invitación, calendario, formularios para recuerdos, mensajes y música. |
| `public/admin.html`, `admin.css`, `admin.js` | Acceso privado, invitados, borradores, publicación, moderación, descargas y QR. |
| `public/data.js` | Contenido público inicial y respaldo si el backend no responde. |
| `public/config.js` | URL de Supabase, clave publicable y dominio del sitio. Nunca secretos. |
| `public/album.js` | Selección de receptor, validación de enlaces de Forms y QR. |
| `public/api.js` | Cliente HTTP de autenticación, base de datos y archivos. |
| `supabase/schema.sql` | Modelo, roles, permisos, capacidad y cierre del álbum. |
| `supabase/seed.sql` | Datos iniciales obtenidos del cuestionario. |
| `supabase/functions/guest-submit/index.ts` | Validación de envíos y subida privada de fotos/videos. |
| `tests/` | Privacidad SQL, conflictos de edición, cuotas, fechas y exportación segura. |
| `docs/` | Activación, publicación, DNS, operación y decisiones pendientes. |

## Alcance respetado

- Un enlace general. Sin enlaces personalizados ni formulario público para confirmar asistencia.
- Cada fila de invitados representa una persona. Agrupación por familia disponible para organización interna. Sin niños ni acompañantes; todos invitados a ambos eventos.
- Las respuestas llegan por medios externos y la pareja las registra manualmente. El botón WhatsApp aparece cuando carguen un contacto.
- Invitación editable con borrador persistente y publicación explícita. Detecta que otro administrador haya cambiado el borrador.
- CSV con filtros y protección contra fórmulas inyectadas al abrir en Excel.
- Mensajes públicos solo después de aprobación. Canciones siempre privadas.
- Álbum preparado para Google Forms + Drive, con enlace editable y QR estable. Requiere crear el formulario real e iniciar sesión en Google para subir. El panel abre Drive; no sincroniza ni enumera sus archivos. Sigue disponible el álbum interno con código para archivos pequeños.
- Sin correos automáticos, trivia, mesas, transporte ni galería de la pareja. Música significa sugerencias para el DJ; no se agregó una pista de fondo sin elegir canción.

## Costos y límites definidos

La opción inicial para recuerdos es Google Forms + Drive: hasta 15 GB compartidos con el resto de la cuenta Google; tamaño de archivo y cuota se configuran en el formulario. El formulario real fue creado y probado. Ver `docs/ALBUM-GOOGLE-DRIVE.md`.

Para la alternativa interna:

GitHub Pages + Supabase Free. Sin servicios pagos ni contrato. Álbum de 800 MiB para dejar margen dentro de 1 GB del proveedor; JPG/PNG/WebP hasta 8 MiB, MP4/MOV/WebM hasta 25 MiB, un archivo por envío. No incluye conversión automática, compresión ni almacenamiento ilimitado. También hay cuota de transferencia del proveedor. Usa un proyecto dedicado.

En el álbum interno: recepción hasta el 01/11/2026 inclusive, hora argentina; el servidor cierra a las 00:00 del 02/11. Las descargas nuevas desde el panel se cierran también. Los enlaces firmados emitidos justo antes pueden seguir válidos hasta 120 segundos. Los objetos no se borran automáticamente: respaldo y eliminación por el titular después de comprobar la descarga.

En Google Forms, el cierre debe configurarse también en el proveedor; se entrega un script opcional de cierre, sin ejecutarlo. Drive conserva acceso para sus propietarios después de la fecha.

La cuenta desarrolladora que tenga acceso administrativo a Supabase también puede acceder a la información. Si quieren que únicamente Carli y Fer administren la aplicación, agregar solo sus UUID a la lista de administradores; la titularidad del backend sigue otorgando acceso técnico al desarrollador.

## Verificación

Con Node instalado: `npm ci`, `npm test`, `npm run check`. Las pruebas SQL usan Postgres embebido con tablas simuladas para `auth` y `storage`; no sustituyen la prueba final en Supabase. La función Edge tiene verificación sintáctica y pruebas de peticiones con servicios simulados; necesita prueba de carga y descarga en el servicio. No se ejecutó prueba visual en navegador ni se afirmó un despliegue real. La integración opcional WebMCP no pudo verificarse en un contexto de navegador compatible.

## Recursos

Ilustración botánica original generada para este proyecto. Tipografías del sistema sin servicio externo. `public/assets/qrcode.js`: qrcode-generator 1.4.4, Kazuhiko Arase, licencia MIT conservada en su encabezado. No se usa un servicio externo para generar el QR ni enviar su código a terceros.
