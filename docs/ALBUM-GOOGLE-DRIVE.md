# Álbum grande gratuito: Google Forms + Drive

La invitación y el panel se alojan en GitHub Pages. Supabase guarda invitados, acceso, borradores, mensajes y canciones. Para los recuerdos grandes, se prepara un formulario de subida que guarda los archivos en Google Drive.

**Es una integración mediante enlace**, sin sincronización automática de archivos con Supabase: la pareja consulta y descarga sus recuerdos desde Drive. No se publican la carpeta ni sus archivos. Todavía hace falta crear el formulario y pegar su enlace real.

## Comparación para esta boda

| Opción | Espacio | Experiencia y uso |
|---|---|---|
| Google Forms + Drive | Hasta 15 GB por cuenta gratuita, compartidos con Gmail y Fotos; cuenta el espacio libre real. | Recomendación para fotos y videos grandes. Invitados inician sesión en Google y envían sin ver los archivos ajenos. |
| Álbum interno Supabase | 800 MiB reservados por el proyecto; fotos 8 MiB y videos 25 MiB. | Alternativa para archivos pequeños y envíos con código, sin crear cuentas. |
| Obsidian | Archivos locales en el dispositivo; no aporta una cuota gratuita de recepción web. | Útil para organizar copias, notas y recuerdos descargados. Sync y Publish son servicios opcionales pagos. |

Referencias: [almacenamiento de Google](https://support.google.com/drive/answer/6374270?hl=es), [subida de archivos en Forms](https://support.google.com/docs/answer/7322334?hl=es), [Obsidian](https://obsidian.md/pricing).

Como ejemplo de dimensionamiento: 45 invitados que envían 10 fotos de 8 MB ocupan unos 3,6 GB. Si además cada uno aporta un video de 100 MB, son otros 4,5 GB: alrededor de 8,1 GB en total. Es un ejemplo, no una predicción. Videos extensos en alta resolución pueden superar ampliamente ese presupuesto.

## Preparar el formulario

1. Iniciá sesión con la cuenta Google elegida para guardar los recuerdos. Revisá primero su espacio disponible en [Almacenamiento de Drive](https://drive.google.com/drive/u/0/quota). No necesitás contratar Google One.
2. Abrí [Google Forms](https://forms.google.com) y creá un formulario vacío: **Recuerdos de Carli y Fer**.
3. Agregá una pregunta de respuesta corta: **Tu nombre**, obligatoria.
4. Agregá una pregunta **Subida de archivos**. Google avisará que los invitados necesitan iniciar sesión. Permití imágenes y videos y elegí cantidad y tamaño. Como configuración inicial, propongo hasta 10 archivos por respuesta y hasta 1 GB por archivo, si esas opciones aparecen en tu cuenta. Eso admite fotos y clips mucho mayores que el álbum interno; no implica espacio ilimitado.
5. En la configuración de recepción de archivos, revisá también el límite total del formulario. Podés reservar unos 10 GB para la boda si tu cuenta tiene ese espacio libre. El límite por archivo no aumenta tu cuota de Drive.
6. Agregá una casilla obligatoria: **Acepto compartir estos archivos con Carli y Fer y quienes administran sus recuerdos.**
7. No limites el formulario a una única respuesta por persona: podrían querer volver a subir archivos. Desactivá cualquier opción de mostrar a los encuestados resúmenes de respuestas.
8. Publicá o habilitá el acceso para responder según la interfaz de tu cuenta y copiá el enlace de encuestado. Debe ser `https://forms.gle/...` o `https://docs.google.com/forms/d/.../viewform`. No copies el enlace de edición ni el de la carpeta.

Google documenta la selección de tipo, cantidad y tamaño de archivo, el inicio de sesión obligatorio y su almacenamiento en la cuenta propietaria. [Ayuda de Forms](https://support.google.com/docs/answer/7322334?hl=es).

## Comprobar privacidad y conectar con la invitación

1. Hacé una respuesta de prueba con una foto y un video de tamaño representativo desde otra cuenta Google.
2. En las respuestas del formulario abrí la carpeta creada en Drive. Comprobá que ambos archivos se abran completos y que la capacidad se haya descontado de la cuenta correcta.
3. En **Compartir → Acceso general**, mantené la carpeta como **Restringido**. Compartila solamente con las cuentas de Carli y Fer, con el permiso que necesiten para organizar y descargar. No les des a todos los invitados permiso de edición sobre una carpeta.
4. Desde la cuenta que envió la prueba, comprobá que no pueda ver las respuestas de los demás ni listar la carpeta. Tener acceso para responder no debe dar acceso a la carpeta.
5. En el panel de la boda: **Invitación → Fotos y videos → Google Forms + Drive**. Pegá el enlace para responder, guardá el borrador y publicá los cambios.
6. Para que el enlace también esté en la copia estática de respaldo, podés completar el mismo `albumUploadUrl` en `public/data.js` antes de publicar los archivos. Si solo lo guardás en el panel, hace falta que Supabase responda para recuperar ese cambio.
7. En **Álbum privado**, abrí Drive para gestionar los recuerdos. No aparecerán automáticamente como archivos del álbum interno.
8. Generá el QR con la URL pública final. En este modo apunta a `#recuerdos`, sin contraseña del panel ni código de invitados. Los formularios de mensajes/canciones de la invitación siguen usando el código de invitados.

## Cerrar la recepción el 2 de noviembre

La invitación deja de ofrecer el enlace al terminar el 1 de noviembre de 2026, hora argentina. **El formulario externo debe cerrarse también**, porque alguien podría guardar su enlace directo.

Podés cerrar la recepción desde las opciones del formulario al terminar el plazo. Para programarlo, incluí `scripts/cierre-google-forms.gs`:

1. Abrí el editor de Apps Script vinculado a ese formulario desde su menú de opciones.
2. Pegá el contenido del archivo en el editor y guardá.
3. Seleccioná la función `instalarCierreAlbum` y ejecutala una vez con la cuenta propietaria.
4. Google pedirá autorización para administrar ese formulario y crear el disparador. Revisá el código: solo programa su cierre; no borra archivos, no cambia permisos y no envía correos.
5. En **Desencadenadores / Triggers**, comprobá que exista `cerrarAlbumBoda` para el 02/11/2026. El script usa una fecha con zona argentina explícita.
6. Los disparadores temporales pueden ejecutarse con demora. Verificá que el formulario haya quedado cerrado; el acceso directo no queda cerrado por el solo hecho de ocultar el botón de la invitación.

El script está entregado, **no instalado ni autorizado en tu cuenta**. La pareja seguirá pudiendo descargar desde su Drive después del cierre; no programé borrado automático ni revocación de acceso a sus propios archivos. [API de Forms](https://developers.google.com/apps-script/reference/forms/form), [disparador por fecha](https://developers.google.com/apps-script/reference/script/clock-trigger-builder).

Si los invitados no quieren iniciar sesión en Google, debemos elegir otro receptor de archivos. No habilitaría una carpeta pública editable para eliminar ese paso, porque dejaría de cumplir la privacidad del álbum.
