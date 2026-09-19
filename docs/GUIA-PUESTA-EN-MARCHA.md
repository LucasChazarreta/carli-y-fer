> Documento histórico de V1. La confirmación manual y el código compartido aquí descritos fueron sustituidos por V2. Para operar o desplegar, usar [V2-OPERACION.md](V2-OPERACION.md) y [V2-ARQUITECTURA.md](V2-ARQUITECTURA.md).

# Carli y Fer — Puesta en marcha sin servicios pagos

**Actualizado el 14/09/2026.** La boda es el 17/10 y desean enviar la invitación el 17/09. Supabase, Google Forms y el repositorio ya fueron configurados. El CNAME del dominio fue cargado y está en propagación. Falta habilitar GitHub Pages, validar el dominio y ejecutar las pruebas finales. No se contrataron planes pagos.

## 1. Qué hace cada parte

| Pieza | Servicio | Función |
|---|---|---|
| Frontend | GitHub Pages | Sirve la invitación y la pantalla del panel. |
| Datos y acceso | Supabase Free | Guarda invitados, respuestas manuales, borradores y permisos. |
| Recuerdos grandes | Google Forms + Drive | Recibe archivos con inicio de sesión Google, sin dar acceso a la carpeta a los invitados. |
| Recuerdos pequeños (alternativa) | Supabase Storage privado | Álbum interno con código y cuota de 800 MiB. |
| Recepción de envíos | Supabase Edge Function | Verifica código, tamaño, tipo de archivo, plazo y espacio antes de guardar. |
| Dirección | Tu dominio existente | Apunta a GitHub Pages mediante DNS. |

Ejemplo: Marta avisa por WhatsApp que asistirá. Carli ingresa al panel y cambia a Marta a “Asiste”. Durante la fiesta, Marta escanea el QR y envía una foto; Carli y Fer pueden descargarla. Marta no puede consultar el listado ni ver el álbum.

GitHub Free permite Pages desde un repositorio público. La base de datos privada no se publica en el repositorio. Supabase Free anuncia 500 MB de base de datos, 1 GB de archivos, 5 GB de transferencia y pausa tras una semana de inactividad; no es una garantía de disponibilidad permanente. No habilites planes pagos ni complementos. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Supabase Free](https://supabase.com/pricing).

## 2. Revisar la muestra

1. Descargá `Vista-Previa-Carli-y-Fer.html` y abrila con Chrome, Edge o Firefox.
2. Mirá los horarios y el diseño. Probá “Agendar la boda”: descarga un `.ics` con dos eventos. El invitado debe aceptar agregarlos; esto no confirma asistencia.
3. Los formularios de la muestra están identificados como no habilitados. No guardan nada ni inventan respuestas.
4. Descargá y descomprimí `Carli-y-Fer-Proyecto.zip`. Conservá la carpeta completa como fuente del proyecto.

## 3. Preparar Supabase

El proyecto dedicado ya está activo con referencia `wrfyceerrcnrvsuzeuzh`. La estructura, el administrador, el Storage privado, los secretos y `guest-submit` fueron verificados. Los pasos siguientes quedan como referencia de mantenimiento; no vuelvas a ejecutar `schema.sql` sobre esta misma base.

1. Abrí [Supabase Dashboard](https://supabase.com/dashboard) con tu cuenta.
2. La consulta del 14/09/2026 encontró tu organización `the projets` (`vzuomnteuzhqkpmmvrqf`) y ningún proyecto accesible. Si ya tenés un proyecto vacío dedicado a esta boda que no aparece en la conexión, usalo y compartí su URL `/dashboard/project/...`. No ejecutes estos archivos sobre la base de otra aplicación.
3. Para uno nuevo, elegí **New project** dentro de una organización **Free**. Nombre sugerido: `carli-y-fer`. Elegí una región cercana disponible y una contraseña de base de datos única. Guardala en tu gestor de contraseñas.
4. Verificá que la organización y el proyecto queden en Free. Si una pantalla te solicita contratar un plan, no avances con ese cambio.
5. Esperá que el proyecto termine de prepararse. Su referencia y URL aparecen en sus ajustes; no son el dominio público de la boda.

### Crear tablas y permisos

1. Abrí **SQL Editor → New query**.
2. En tu computadora abrí `supabase/schema.sql` con un editor de texto. Copiá su contenido completo al editor SQL y elegí **Run**.
3. Esperá la confirmación de ejecución sin errores. El archivo crea tablas nuevas y políticas de privacidad; está pensado para ejecutarse una sola vez.
4. En una segunda consulta ejecutá `supabase/seed.sql` completo. Carga solamente los datos de la boda, sin invitados ficticios.
5. En **Table Editor** deberían existir `wedding_settings`, `wedding_draft`, `guests`, `messages` y `memories`.
6. En **Storage** debería existir `wedding-memories` con acceso **privado**. No lo cambies a público ni agregues políticas de lectura o subida anónimas.

Si una consulta falla, conservá el mensaje de error y compartilo. No vuelvas a ejecutar todo indiscriminadamente ni borres tablas para “limpiar”. Cada archivo SQL utiliza una transacción.

### Crear los accesos del panel

1. Entrá a **Authentication → Users**.
2. Usá la opción de **crear un usuario**, con email y contraseña; no la opción de invitar por correo si no querés enviar emails. Si aparece **Auto Confirm User**, activala para esta cuenta creada manualmente.
3. Copiá el **User UID**, un identificador con guiones. Crear una cuenta no le otorga permiso de administrador automáticamente.
4. En SQL Editor ejecutá lo siguiente, reemplazando el texto de ejemplo por ese UID exacto:

```sql
insert into private.wedding_admins(user_id)
values ('UUID-REAL-DEL-USUARIO');
```

5. Repetí para cada administrador autorizado. Si solo usás tu email del cuestionario, inicialmente el acceso será tuyo. Para que Carli y Fer tengan cuentas independientes hacen falta sus emails y dos usuarios.
6. En la configuración de Authentication, desactivá la creación pública de cuentas (**Allow new users to sign up** o su equivalente). Esta app no ofrece registro público.
7. En **URL Configuration**, configurá **Site URL** con la dirección final de la invitación. Este acceso usa email y contraseña y no depende de emails automáticos de recuperación; un restablecimiento se gestiona desde tu cuenta de administración.

Las contraseñas no van en archivos públicos ni en este chat. Si más adelante querés recuperación autónoma por correo, se configura como una tarea separada: el envío de correo predeterminado del proveedor tiene restricciones. [Autenticación con contraseña](https://supabase.com/docs/guides/auth/passwords).

### Activar la función que recibe archivos y mensajes

1. Abrí `supabase/functions/guest-submit/index.ts` en tu editor.
2. En el panel de Supabase entrá a **Edge Functions**. Creá una función con nombre exacto **`guest-submit`**, usando el editor del Dashboard.
3. Reemplazá su código por el contenido completo de ese archivo y desplegala.
4. En la configuración de esa función desactivá **Verify JWT** / **Enforce JWT verification**. Es una función para invitados sin cuenta. La protección del envío la realizan el código de invitados, los límites del servidor y la base de datos; las tablas y el álbum siguen privados.
5. En **Edge Functions → Secrets**, agregá estos tres valores:

| Nombre | Qué colocar |
|---|---|
| `WEDDING_GUEST_CODE` | Código aleatorio de al menos 12 caracteres para los invitados. Por ejemplo, generá 16 o más caracteres en un gestor de contraseñas. No uses una contraseña del panel. |
| `WEDDING_RATE_SALT` | Otro secreto aleatorio, preferentemente 32 caracteres o más. Nunca se comparte con invitados. |
| `WEDDING_ALLOWED_ORIGINS` | Orígenes permitidos separados por comas, sin ruta ni barra final: `https://lucaschazarreta.github.io,https://boda-carli-fer.agentslucca.online` |

Los nombres con prefijo `SUPABASE_` que utiliza el código son valores del entorno del servicio. No copies `SUPABASE_SERVICE_ROLE_KEY` al frontend: permite acceso elevado.

6. Guardá los secretos y verificá que la función esté desplegada. Cuando incorpores `www` u otro origen real, agregalo a la lista de orígenes permitidos. La ruta `/carli-y-fer/` no forma parte del origen.

Si preferís la CLI y ya la tenés instalada, el proyecto incluye `supabase/config.toml` con la misma configuración. Dentro de la carpeta del proyecto, después de autenticar la CLI y seleccionar el proyecto correcto:

```bash
supabase link --project-ref REFERENCIA-REAL
supabase functions deploy guest-submit --no-verify-jwt
```

La guía oficial explica ambos flujos. [Desplegar Edge Functions](https://supabase.com/docs/guides/functions/deploy).

## 4. Conectar los archivos del sitio

1. En los ajustes del proyecto Supabase obtené **Project URL** y la **Publishable key**. También es compatible la antigua clave `anon` del proyecto. **Nunca uses una clave secreta ni `service_role`.**
2. Abrí `public/config.js` y completá:

```js
export const config = Object.freeze({
  supabaseUrl: 'https://REFERENCIA-REAL.supabase.co',
  supabasePublishableKey: 'CLAVE-PUBLICABLE-REAL',
  siteUrl: 'https://boda-carli-fer.agentslucca.online/',
});
```

3. Antes de tener el dominio conectado, podés usar en `siteUrl` `https://lucaschazarreta.github.io/carli-y-fer/`, si creás el repositorio con ese nombre.
4. La clave publicable está diseñada para estar en el navegador. Lo que protege los datos son las políticas de acceso del SQL, no esconder esa clave. [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## 5. Publicar en GitHub Pages

Tu cuenta conectada es `LucasChazarreta` y el repositorio público `carli-y-fer` ya fue creado.

1. Abrí [Crear repositorio](https://github.com/new). Elegí tu cuenta, nombre **carli-y-fer** y visibilidad **Public**. Crealo vacío.
2. Elegí **uploading an existing file** o **Add file → Upload files**.
3. Arrastrá **el contenido de `public`**, incluyendo la carpeta `assets`, a la raíz del repositorio. No arrastres la carpeta `public` como un único nivel superior.
4. Confirmá con **Commit changes**. La raíz debe contener `index.html`, `admin.html`, los archivos `.js`, `.css` y `assets`. No subas `.env`, contraseñas, invitados reales ni copias de base de datos.
5. Abrí **Settings → Pages**. En **Build and deployment**, seleccioná **Deploy from a branch**, rama **main** y carpeta **/(root)**. Guardá.
6. Cuando termine la publicación, abrí el enlace que muestre Pages. Con ese nombre de repositorio, será `https://lucaschazarreta.github.io/carli-y-fer/`.

Publicar esos archivos no publica las tablas SQL. El contenido de la invitación sí será accesible desde su enlace; `noindex` pide a buscadores que no la indexen, pero no funciona como una contraseña. [Publicar en Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## 6. Conectar tu dominio en Hostinger

Dominio que ya posee Lucca: **agentslucca.online**. Cuenta GitHub identificada: **LucasChazarreta**.

| Dirección | Qué hace falta |
|---|---|
| `boda-carli-fer.com` | Registrar ese dominio por separado si está disponible y pagar su registro/renovación. |
| `boda-carli-fer.online` | Registrar ese dominio por separado si está disponible y pagar su registro/renovación. |
| `boda-carli-fer.agentslucca.online` | Crear un subdominio de tu dominio actual; no requiere comprar otro dominio. Es la opción preparada. |
| `agentslucca.online/boda-carli-fer/` | Publicar en una ruta de tu dominio actual; requiere coordinarla con el sitio que ocupe la raíz. |

No se verificó la disponibilidad registral de los dos dominios nuevos ni se compró ninguno. Tener `agentslucca.online` permite crear nombres debajo de él, pero no otorga otros dominios terminados en `.online`.

### Configuración preparada

`public/config.js` contiene `https://boda-carli-fer.agentslucca.online/`. Esto prepara la dirección para el QR; **todavía no crea el subdominio ni lo publica**. Si elegís un dominio exclusivo, cambiaremos esa dirección y el origen permitido en Supabase.

La consulta pública de DNS del 13/09/2026 devolvió `lunar.dns-parking.com` y `solar.dns-parking.com` como servidores del dominio, y un registro A en la raíz hacia `185.199.108.153`. No se modificaron estos registros. Para el subdominio no necesitamos reemplazar el registro de la raíz.

### Pasos para la opción sin dominio adicional

1. Publicá el contenido de `public` en el repositorio de la boda siguiendo la guía general. Verificá primero que la dirección de GitHub Pages abra correctamente.
2. En los ajustes **de tu cuenta GitHub → Pages**, verificá `agentslucca.online` usando el TXT que te indique GitHub. El valor del TXT lo genera GitHub; no es un valor fijo que pueda inventarse.
3. En **repositorio de la boda → Settings → Pages → Custom domain**, escribí `boda-carli-fer.agentslucca.online` y guardá. Hacé este paso antes de apuntar el DNS.
4. Abrí Hostinger hPanel. Andá a **Dominios → DNS** y seleccioná **agentslucca.online**. En otras vistas puede aparecer **Administrar → DNS / Nameservers → DNS records**.
5. Agregá el siguiente registro:

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre / Host | `boda-carli-fer` |
| Destino / Apunta a | `lucaschazarreta.github.io` |
| TTL | El predeterminado del panel, por ejemplo 3600 si está disponible. |

6. El destino no lleva `https://`, barra ni nombre de repositorio. En el campo Nombre suele escribirse solo `boda-carli-fer`, porque Hostinger agrega el dominio. Verificá que el resultado no duplique `.agentslucca.online`.
7. Si ya hay un A, AAAA o CNAME con nombre exacto `boda-carli-fer`, revisá qué servicio usa antes de sustituirlo. No borres registros de la raíz, correo ni otros subdominios.
8. Esperá la propagación. Cuando GitHub muestre DNS correcto y el certificado esté disponible, activá **Enforce HTTPS**. Puede tardar hasta 24 horas.
9. En los secretos de la función de Supabase, usá `WEDDING_ALLOWED_ORIGINS=https://lucaschazarreta.github.io,https://boda-carli-fer.agentslucca.online`. En Authentication, configurá el Site URL con la dirección final.
10. Probá la invitación y un envío desde el dominio final antes de compartir el enlace o imprimir el QR.

Fuentes: [DNS en Hostinger](https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/), [dominio y subdominio en GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

Para comprobar el registro en PowerShell:

```powershell
Resolve-DnsName boda-carli-fer.agentslucca.online -Type CNAME
```

Si elegís comprar `boda-carli-fer.com` o `.online`, no registres ambos por necesidad técnica: alcanza con uno. Luego se configura como dominio de Pages con sus registros correspondientes. El hosting puede seguir siendo gratuito; el dominio adicional tendría su propia renovación.


## 7. Completar datos desde el panel

Abrí `/admin.html` dentro de la dirección del sitio e ingresá con la cuenta autorizada.

- **Invitación:** completá dos direcciones y enlaces de Maps independientes. El enlace acortado ya se resolvió a Google Maps y aparece como ubicación compartida. Falta indicar a cuál de los dos lugares corresponde. Agregá alias y titular de regalos, vestimenta y contacto si los quieren mostrar. Los campos vacíos se ocultan.
- **Guardar borrador:** guarda sin publicar. Usá **Ver borrador** para revisar y volvé con el botón Atrás del navegador. Luego **Publicar cambios**.
- **Invitados:** cargá una persona por fila, agrupando por familia si sirve. Registrá por separado a quienes asisten, no asisten o están pendientes. Se exportan las filas visibles según los filtros.
- **Mensajes y música:** aprobá solo lo que quieran mostrar. Las canciones permanecen privadas y pueden exportarse para el DJ.
- **Álbum:** seleccioná Google Forms + Drive y pegá el enlace para responder, o elegí la alternativa interna. El QR del modo Google abre la sección Recuerdos de la invitación y no lleva código. Descargalo y probalo desde un celular antes de imprimir. Los archivos de Drive se administran en Drive.

### Configurar el álbum grande

La invitación y el panel se alojan en GitHub Pages. Supabase guarda invitados, acceso, borradores, mensajes y canciones. Para los recuerdos grandes, se prepara un formulario de subida que guarda los archivos en Google Drive.

**Es una integración mediante enlace**, sin sincronización automática de archivos con Supabase: la pareja consulta y descarga sus recuerdos desde Drive. No se publican la carpeta ni sus archivos. Todavía hace falta crear el formulario y pegar su enlace real.

#### Comparación para esta boda

| Opción | Espacio | Experiencia y uso |
|---|---|---|
| Google Forms + Drive | Hasta 15 GB por cuenta gratuita, compartidos con Gmail y Fotos; cuenta el espacio libre real. | Recomendación para fotos y videos grandes. Invitados inician sesión en Google y envían sin ver los archivos ajenos. |
| Álbum interno Supabase | 800 MiB reservados por el proyecto; fotos 8 MiB y videos 25 MiB. | Alternativa para archivos pequeños y envíos con código, sin crear cuentas. |
| Obsidian | Archivos locales en el dispositivo; no aporta una cuota gratuita de recepción web. | Útil para organizar copias, notas y recuerdos descargados. Sync y Publish son servicios opcionales pagos. |

Referencias: [almacenamiento de Google](https://support.google.com/drive/answer/6374270?hl=es), [subida de archivos en Forms](https://support.google.com/docs/answer/7322334?hl=es), [Obsidian](https://obsidian.md/pricing).

Como ejemplo de dimensionamiento: 45 invitados que envían 10 fotos de 8 MB ocupan unos 3,6 GB. Si además cada uno aporta un video de 100 MB, son otros 4,5 GB: alrededor de 8,1 GB en total. Es un ejemplo, no una predicción. Videos extensos en alta resolución pueden superar ampliamente ese presupuesto.

#### Preparar el formulario

1. Iniciá sesión con la cuenta Google elegida para guardar los recuerdos. Revisá primero su espacio disponible en [Almacenamiento de Drive](https://drive.google.com/drive/u/0/quota). No necesitás contratar Google One.
2. Abrí [Google Forms](https://forms.google.com) y creá un formulario vacío: **Recuerdos de Carli y Fer**.
3. Agregá una pregunta de respuesta corta: **Tu nombre**, obligatoria.
4. Agregá una pregunta **Subida de archivos**. Google avisará que los invitados necesitan iniciar sesión. Permití imágenes y videos y elegí cantidad y tamaño. Como configuración inicial, propongo hasta 10 archivos por respuesta y hasta 1 GB por archivo, si esas opciones aparecen en tu cuenta. Eso admite fotos y clips mucho mayores que el álbum interno; no implica espacio ilimitado.
5. En la configuración de recepción de archivos, revisá también el límite total del formulario. Podés reservar unos 10 GB para la boda si tu cuenta tiene ese espacio libre. El límite por archivo no aumenta tu cuota de Drive.
6. Agregá una casilla obligatoria: **Acepto compartir estos archivos con Carli y Fer y quienes administran sus recuerdos.**
7. No limites el formulario a una única respuesta por persona: podrían querer volver a subir archivos. Desactivá cualquier opción de mostrar a los encuestados resúmenes de respuestas.
8. Publicá o habilitá el acceso para responder según la interfaz de tu cuenta y copiá el enlace de encuestado. Debe ser `https://forms.gle/...` o `https://docs.google.com/forms/d/.../viewform`. No copies el enlace de edición ni el de la carpeta.

Google documenta la selección de tipo, cantidad y tamaño de archivo, el inicio de sesión obligatorio y su almacenamiento en la cuenta propietaria. [Ayuda de Forms](https://support.google.com/docs/answer/7322334?hl=es).

#### Comprobar privacidad y conectar con la invitación

1. Hacé una respuesta de prueba con una foto y un video de tamaño representativo desde otra cuenta Google.
2. En las respuestas del formulario abrí la carpeta creada en Drive. Comprobá que ambos archivos se abran completos y que la capacidad se haya descontado de la cuenta correcta.
3. En **Compartir → Acceso general**, mantené la carpeta como **Restringido**. Compartila solamente con las cuentas de Carli y Fer, con el permiso que necesiten para organizar y descargar. No les des a todos los invitados permiso de edición sobre una carpeta.
4. Desde la cuenta que envió la prueba, comprobá que no pueda ver las respuestas de los demás ni listar la carpeta. Tener acceso para responder no debe dar acceso a la carpeta.
5. En el panel de la boda: **Invitación → Fotos y videos → Google Forms + Drive**. Pegá el enlace para responder, guardá el borrador y publicá los cambios.
6. Para que el enlace también esté en la copia estática de respaldo, podés completar el mismo `albumUploadUrl` en `public/data.js` antes de publicar los archivos. Si solo lo guardás en el panel, hace falta que Supabase responda para recuperar ese cambio.
7. En **Álbum privado**, abrí Drive para gestionar los recuerdos. No aparecerán automáticamente como archivos del álbum interno.
8. Generá el QR con la URL pública final. En este modo apunta a `#recuerdos`, sin contraseña del panel ni código de invitados. Los formularios de mensajes/canciones de la invitación siguen usando el código de invitados.

#### Cerrar la recepción el 2 de noviembre

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


## 8. Prueba final antes de enviar invitaciones

Estas verificaciones dependen del proyecto real. No se dieron por realizadas durante la construcción local.

1. Abrí el sitio en celular con datos móviles y en una computadora; comprobá legibilidad y botones.
2. Desde una ventana privada, intentá abrir el panel: debe pedir acceso y no mostrar invitados.
3. Cargá una persona de prueba, marcala como asistente y verificá la misma respuesta desde otro dispositivo autorizado. Luego eliminá ese registro.
4. Editá una frase y guardá el borrador. Verificá que la invitación normal conserve el texto anterior; publicá y comprobá el cambio en otra ventana.
5. Enviá un mensaje de prueba: no debe verse públicamente hasta aprobarlo. Ocultalo después para comprobar la moderación.
6. Si elegís Google Forms + Drive, subí una foto y un video representativos desde otra cuenta Google, descargalos desde Drive y comprobá que quien envió no pueda acceder a la carpeta ni a otras respuestas. Si elegís el álbum interno, probá su carga y descarga desde el panel y comprobá que una ventana privada no pueda listar ni leer el bucket.
7. En mensajes y canciones, probá un código incorrecto: no deben guardarse. Para archivos, comprobá los límites del receptor elegido. Un fallo no debe mostrar un mensaje de éxito.
8. Probá el QR real desde otro celular y guardá el calendario. Confirmá **17/10, ceremonia 21:00 y fiesta 22:00 en Argentina**.
9. Exportá el CSV, abrilo en Excel y verificá nombres, acentos y estados.
10. Revisá los dos Maps y el alias con la pareja antes del envío del 17/09.

## 9. Mantenerlo gratuito y conservar los recuerdos

La alternativa de almacenamiento interno en Supabase limita su álbum a **800 MiB**, con fotos de hasta **8 MiB** y videos de hasta **25 MiB**. Solo esa alternativa admite JPG, PNG, WebP, MP4, MOV y WebM; fotos HEIC/HEIF deben convertirse antes. No convierte ni comprime automáticamente.

El modo Google Forms + Drive utiliza el espacio libre de la cuenta Google y los tamaños y tipos permitidos que elijas en el formulario. Los límites de 8 y 25 MiB del álbum interno no se aplican a los envíos por Google Forms.

Antes del 17/09 y del 17/10 revisá en el Dashboard que Supabase no esté pausado. Si el plan lo pausó por inactividad, restauralo desde el panel y probá las funciones. La invitación estática puede seguir abriendo aunque las funciones de datos fallen. No se instaló una tarea artificial para eludir la política de inactividad.

Revisá **Usage** para almacenamiento y transferencia. Descargar 800 MB varias veces consume transferencia, aunque no agregue archivos. Guardá una copia de los CSV y descargá los recuerdos durante el período acordado. El plan Free no incluye el mismo respaldo automático del plan pago; prepará el respaldo manual desde el panel y, para la base completa, con las herramientas de exportación del proveedor.

Para el álbum interno, el cierre está fijado del lado del servidor al **02/11/2026 a las 00:00 de Argentina**. No se aceptan nuevos archivos y no se generan descargas nuevas desde el panel después de esa fecha. Los enlaces de descarga duran hasta 120 segundos. El titular puede recuperar material desde el Dashboard. No hay borrado automático: comprobá las copias antes de eliminar archivos.

Si un envío interrumpido deja capacidad reservada, no la liberes a ciegas: revisá `private.submission_tickets`, `memories` y los objetos del bucket, y recién después marcá como fallida una reserva que no tenga un objeto pendiente. La reserva conservadora evita superar el límite durante fallas.

## 10. Qué quedó probado y qué falta

El proyecto se conectó a Supabase real y se verificaron URL, clave publicable, tablas con RLS y Edge Function activa con JWT desactivado. Maps quedó en Finca La Sureña y Google Forms fue probado. Las pruebas locales y visuales deben repetirse después de cada cambio; la publicación y el dominio se validan con las listas de esta guía.

**Pendientes reales:** habilitar Pages desde `main` y `/(root)`, esperar la propagación del CNAME, configurar el dominio personalizado y activar HTTPS. Los novios cargarán el alias desde el panel. No compartas contraseñas ni claves secretas.
