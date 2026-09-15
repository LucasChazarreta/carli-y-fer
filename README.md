# Carli y Fer · Invitación V2

Invitación botánica para el 17/10/2026, Santiago del Estero. GitHub Pages sirve `public/`; Supabase gestiona panel privado, invitaciones, confirmaciones, mensajes y el álbum interno. Google Forms + Drive sigue recibiendo los recuerdos grandes.

La V2 separa **invitations → guests**: cada grupo recibe un enlace personal y cada persona responde de forma independiente. El panel crea y edita invitaciones, recupera el mismo enlace, permite compartir/copiar/descargar QR y revocar o regenerar accesos. Las respuestas se actualizan automáticamente en el listado.

- [Guía de uso de V2](docs/V2-OPERACION.md)
- [Arquitectura, seguridad y migración V2](docs/V2-ARQUITECTURA.md)
- [Álbum Google Forms + Drive](docs/ALBUM-GOOGLE-DRIVE.md)
- [Dominio](docs/DOMINIO-HOSTINGER.md)

Se conservan la apertura con moño, música de fondo existente, animaciones suaves y preferencias de movimiento reducido. El QR público de recuerdos es diferente del QR personal de cada invitación. No se agregaron fotos de la pareja, acompañantes ni personas ficticias al listado real.

La migración RSVP antigua está archivada y no debe aplicarse. La producción existente recibe solo la migración V2 incremental; `supabase/schema.sql` se reserva para instalaciones nuevas.

Con Node: `npm ci`, `npm test`, `npm run check`, `npm run check:edge`. Para servir localmente: `python -m http.server 8080 --directory public`. Las Edge requieren los orígenes autorizados; una prueba local no debe añadir localhost a producción.

Quedan por cargar por la pareja: alias/titular, vestimenta, WhatsApp y direcciones textuales. El flyer vertical está contemplado como entrega posterior.

Ilustración botánica original. Tipografías del sistema. `public/assets/qrcode.js`: qrcode-generator 1.4.4, Kazuhiko Arase, MIT, licencia conservada.
