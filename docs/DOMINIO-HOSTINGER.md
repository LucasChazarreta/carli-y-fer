# Dirección de la boda y DNS en Hostinger

Dominio que ya posee Lucca: **agentslucca.online**. Cuenta GitHub identificada: **LucasChazarreta**.

| Dirección | Qué hace falta |
|---|---|
| `boda-carli-fer.com` | Registrar ese dominio por separado si está disponible y pagar su registro/renovación. |
| `boda-carli-fer.online` | Registrar ese dominio por separado si está disponible y pagar su registro/renovación. |
| `boda-carli-fer.agentslucca.online` | Crear un subdominio de tu dominio actual; no requiere comprar otro dominio. Es la opción preparada. |
| `agentslucca.online/boda-carli-fer/` | Publicar en una ruta de tu dominio actual; requiere coordinarla con el sitio que ocupe la raíz. |

No se verificó la disponibilidad registral de los dos dominios nuevos ni se compró ninguno. Tener `agentslucca.online` permite crear nombres debajo de él, pero no otorga otros dominios terminados en `.online`.

## Configuración preparada

`public/config.js` contiene `https://boda-carli-fer.agentslucca.online/`. Esto prepara la dirección para el QR; **todavía no crea el subdominio ni lo publica**. Si elegís un dominio exclusivo, cambiaremos esa dirección y el origen permitido en Supabase.

La consulta pública de DNS del 13/09/2026 devolvió `lunar.dns-parking.com` y `solar.dns-parking.com` como servidores del dominio, y un registro A en la raíz hacia `185.199.108.153`. No se modificaron estos registros. Para el subdominio no necesitamos reemplazar el registro de la raíz.

## Pasos para la opción sin dominio adicional

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
