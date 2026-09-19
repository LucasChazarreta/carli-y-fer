# V2 · Invitaciones de Carli y Fer

## Uso del panel

1. Entrar a `admin.html` con la cuenta administradora existente.
2. En **Invitaciones**, elegir **Nueva invitación**. Escribir el nombre del grupo y agregar las personas que incluye. No agrega acompañantes automáticamente.
3. Al guardar se abre el enlace personal. Copiarlo, compartirlo, descargar su QR o abrir la vista previa. La vista previa es la invitación real; responder allí modifica los datos reales.
4. Las respuestas se actualizan cada 30 segundos mientras el listado está visible. Se pueden filtrar por persona, invitación, estado o alimentación, y exportar a CSV.
5. **Editar** permite corregir nombres, agregar/quitar personas y registrar respuestas manualmente. Las notas y alimentación solo aparecen en el panel; la V2 no pregunta alimentación al invitado mientras la pareja no lo defina.
6. **Regenerar** invalida el enlace anterior; hay que compartir el nuevo. **Revocar** deshabilita el acceso sin borrar personas ni respuestas. Regenerar permite volver a habilitarlo.

Los enlaces no cambian al abrir el panel ni al editar personas. El sistema comprueba la versión antes de guardar: si otra persona cambió la invitación, actualizar el listado y volver a abrir **Editar** antes de aplicar los cambios.

## Invitados

El enlace `?i=...` identifica una sola invitación. Nadie necesita escribir un código ni su nombre para confirmar. Cada persona tiene su respuesta; se puede responder parcialmente dejando personas pendientes. Hasta el 30/09 inclusive, hora argentina, se puede volver al mismo enlace para modificar respuestas. El servidor usa la fecha publicada en `responseDeadline`, editable desde el panel; las ediciones administrativas siguen disponibles después del cierre.

Al menos una persona confirmada habilita una prueba firmada de 30 minutos para `/confirmados/`, mensajes, canciones y el álbum interno. Si vence, volver a abrir la invitación la renueva si todavía hay una persona confirmada. Revocar el enlace, regenerarlo o dejar todas las personas sin confirmar invalida la autorización al volver a comprobarla. El token de invitación se retira de la barra de direcciones y se mantiene solo durante la sesión del navegador. Las pruebas nunca se incluyen en URLs. Un enlace personal permite responder por todas las personas de esa invitación: compartir solo con sus destinatarios.

El QR **personal** contiene el enlace de la invitación y debe tratarse como tal. El QR **de recuerdos** apunta a la sección pública `#recuerdos` y no incluye token alguno.

## Google Forms

Se conserva el formulario existente y su almacenamiento en Drive. El QR público permite llegar al formulario sin introducir el viejo código compartido. Google controla el acceso y los límites de ese formulario; nuestra prueba de confirmación NO protege una URL de Google Forms si alguien la conoce o la reenvía. Se conserva este comportamiento para que el QR público de recuerdos siga siendo útil.

El cierre previsto sigue siendo el 02/11/2026 a las 00:00 de Argentina. El código oculta el enlace después del plazo; el cierre efectivo de Google Forms debe configurarse en Google (ver `ALBUM-GOOGLE-DRIVE.md`). No se borran archivos automáticamente.

## Datos pendientes

Alias y titular, vestimenta, WhatsApp y direcciones textuales siguen siendo editables desde el panel. No se inventaron datos ni invitados reales. El mapa del Oratorio es `https://goo.su/dLQSOD`; el de la fiesta permanece `https://goo.su/6zn23`. El flyer vertical queda como entrega posterior, sin bloquear esta versión.
