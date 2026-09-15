> Documento histórico de V1. La confirmación manual y el código compartido aquí descritos fueron sustituidos por V2. Para operar o desplegar, usar [V2-OPERACION.md](V2-OPERACION.md) y [V2-ARQUITECTURA.md](V2-ARQUITECTURA.md).

# Decisiones y datos pendientes

Fuente revisada: `Propuesta-Invitacion-Digital-Boda.pdf`, cuatro páginas, incluidos los casilleros elegidos.

| Dato | Respuesta / implementación |
|---|---|
| Nombres | Carli y Fer |
| Fecha | 17 de octubre de 2026 |
| Ciudad | Santiago del Estero |
| Ceremonia | Oratorio Don Bosco, 21:00 |
| Fiesta | Finca La Sureña, 22:00 |
| Envío deseado | 17 de septiembre de 2026 |
| Respuestas | Hasta el 30/09; 01/10 como margen mencionado, no como segunda fecha publicada. |
| Invitados | Aproximadamente 45 personas. No se inventaron nombres ni se cargaron personas ficticias. |
| Niños / acompañantes | No / no |
| Confirmación pública | No. Registro manual en el panel. |
| Estilo | Botánico blanco y verde, sin fotografías de la pareja. |
| Álbum | Privado para administradores; invitados solo envían. Sin publicación de fotos ni galería pública. |
| Retención | Recepción hasta 01/11 inclusive; cierre 02/11 a las 00:00 de Argentina. Google Forms requiere cierre propio; sus propietarios conservan acceso en Drive. |

## Estado de la publicación final

1. **Dominio:** confirmado `agentslucca.online`, Hostinger. Se eligió `boda-carli-fer.agentslucca.online`; su CNAME fue cargado y está en propagación. Los nombres `boda-carli-fer.com` y `boda-carli-fer.online` no se compraron.
2. **Repositorio de destino:** creado `LucasChazarreta/carli-y-fer`, público.
3. **Supabase:** proyecto dedicado `wrfyceerrcnrvsuzeuzh` creado y configurado. Base, RLS, administrador, Storage privado, secretos y Edge Function activos.
4. **Ubicación:** `https://goo.su/6zn23` corresponde exclusivamente a **Finca La Sureña** y se asignó al botón de la fiesta. El Oratorio Don Bosco permanece sin enlace hasta recibir su ubicación confirmada.
5. **Regalos:** el usuario confirmó que los novios cargarán el alias desde el panel. El campo ya existe y la sección permanece oculta hasta completarse; no bloquea el desarrollo.
6. **Vestimenta y WhatsApp de contacto**, si quieren mostrarlos. Ocultos hasta completarse.
7. **Accesos de Carli/Fer.** El cuestionario solo incluye un email del desarrollador. Si cada integrante tendrá su cuenta, faltan sus emails; no confundir el correo del desarrollador con una cuenta exclusiva de la pareja. No se envió ninguna invitación por correo.
8. **Google Forms + Drive:** formulario privado creado, probado y conectado; el almacenamiento se gestiona en Drive.
9. **Código compartido de invitados:** secreto aleatorio configurado. Debe compartirse solo con las personas invitadas; no es la contraseña del panel.

## Criterios elegidos cuando la respuesta necesitaba interpretación

El panel incluye “ver respuestas” aunque marcaron “no” a confirmación pública: se entiende como listado de estados registrados manualmente. Un grupo familiar puede tener algunos asistentes y otros ausentes porque cada persona tiene su propia fila. No se generan cupos públicos ni acompañantes, acorde a la decisión expresa.

“Aprobar fotos” no implica publicarlas: como el álbum es privado, la pareja puede conservar o eliminar recuerdos. Solo los mensajes escritos tienen aprobación para aparecer públicamente. La frase “Música y mensajes” se interpreta como sugerencias para el DJ, según la descripción de la opción; no autoriza música comercial de fondo.

La fecha de cierre se tomó como fin del día del 1 de noviembre. No se borra material automáticamente a medianoche, para dar oportunidad de verificar el respaldo. Esto debe comunicarse antes de recibir recuerdos.
