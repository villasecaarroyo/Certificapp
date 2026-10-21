# Certificapp

Aplicación web para emitir certificados, invitaciones académicas, cartas de aceptación y credenciales de evento, de forma individual o masiva, con verificación pública mediante código QR. Funciona íntegramente en el navegador y se publica gratis en GitHub Pages, sin servidor ni base de datos.

## Qué hace

**Diseño.** Editor visual sobre el lienzo del documento, con arrastre y redimensionamiento de textos, logos, firmas, códigos QR, rectángulos y líneas. Incluye plantillas base para certificado (A4 horizontal), invitación y carta de aceptación (A4 vertical) y credencial (10×14 cm), además de tamaños Carta, Oficio, A5 y A6. Admite fondos y marcas de agua en PNG, JPG o SVG, firmas en PNG transparente con nombre y cargo, fuentes TTF u OTF propias, y exportación o importación de la plantilla como JSON.

**Variables.** Cualquier texto acepta `{{variable}}`, con filtros como `{{nombre|upper}}` o `{{nombre|title}}`, además de `**negrita**` y `*cursiva*` dentro del mismo párrafo. Los bloques `[[ ... ]]` desaparecen completos si alguna variable de su interior está vacía, lo que permite escribir, por ejemplo, `[[Ponencia «{{titulo_trabajo}}»]]` y que la línea solo aparezca para quienes expusieron.

| Grupo | Variables |
|---|---|
| Participante | `nombre`, `rut_dni`, `email`, `rol`, `tratamiento`, `afiliacion`, `titulo_trabajo`, `mesa`, `duracion_horas`, `nota` |
| Evento | `institucion`, `unidad`, `tipo_actividad`, `evento`, `edicion`, `fecha`, `lugar`, `ciudad`, `modalidad`, `duracion_horas`, más campos propios |
| Sistema | `id`, `codigo`, `folio`, `hash`, `fecha_emision`, `url_verificacion`, `tipo_documento` |

Toda columna de la planilla que no se asigne a un campo queda disponible con su nombre normalizado (por ejemplo, la columna «Código curso» se usa como `{{codigo_curso}}`).

**Datos.** Importación de CSV (UTF-8 o el formato con punto y coma que guarda Excel en español) y XLSX, con mapeo automático de encabezados a campos, corrección manual del mapeo y alta manual de participantes para emisiones individuales. Los datos de participantes no se guardan en el navegador; existen solo durante la sesión.

**Vista previa.** El editor y el PDF comparten el mismo motor de maquetación, de modo que lo que se ve en pantalla coincide con lo impreso. La pestaña de emisión muestra el PDF definitivo fila por fila e incluye un botón para saltar al nombre más largo del lote. Los nombres que no caben se reducen automáticamente hasta el tamaño mínimo definido.

**Emisión.** Lote completo, una fila o un rango. Salida en ZIP con un PDF por persona (nombre configurable, por defecto `Certificado_Juan_Perez.pdf`) y el registro del lote en CSV y JSON, o en un único PDF multipágina para imprenta. Cada documento recibe un UUID v4, un folio correlativo, una huella SHA-256 de sus datos, un código corto legible derivado de esa huella y la huella SHA-256 del archivo PDF final. El ID, el código y el folio quedan además en los metadatos del PDF.

**Verificación.** El QR apunta a `https://<usuario>.github.io/<repo>/verify/?id=<uuid>`. El portal acepta también el código corto o el folio, distingue documentos vigentes, revocados e inexistentes, y permite cargar un PDF para comprobar, sin subirlo a ningún servidor, que es idéntico byte a byte al emitido.

**Distribución.** Envío opcional por correo con EmailJS, adjuntando el PDF o solo el enlace de verificación.

## Puesta en marcha

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # prueba del motor: genera PDFs de cada plantilla
npm run build      # versión de producción en dist/
```

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo, `certifica`) y sube este proyecto:
   ```bash
   git init && git add . && git commit -m "Certifica"
   git branch -M main
   git remote add origin https://github.com/<usuario>/certifica.git
   git push -u origin main
   ```
2. En el repositorio, entra a **Settings → Pages** y en **Source** elige **GitHub Actions**.
3. El flujo `.github/workflows/deploy.yml` compila y publica en cada `push` a `main`. Al terminar, la aplicación queda en `https://<usuario>.github.io/certifica/` y el portal en `https://<usuario>.github.io/certifica/verify/`.
4. En la aplicación publicada, abre **Ajustes** y confirma la URL pública. Si la dejas vacía se usa la dirección desde la que abriste la aplicación, lo que es correcto cuando emites desde GitHub Pages; conviene fijarla si emites desde `localhost`.

La configuración usa rutas relativas (`base: './'`), por lo que funciona con cualquier nombre de repositorio y también con un dominio propio.

## Uso

La aplicación es un asistente de cinco pasos pensado para personas sin conocimientos técnicos: elegir el modelo, completar los datos del evento con el logo y las firmas, ajustar el diseño (opcional), cargar la lista de personas y generar.

Para que los códigos QR funcionen, la primera vez se pulsa **Activar verificación** y se sigue una guía de tres pasos que crea en GitHub una clave de acceso limitada a este repositorio (permiso *Contents: Read and write*). Desde entonces, cada vez que se generan documentos la aplicación publica sola el registro en `public/registry.json`, combinándolo con lo ya publicado desde otros computadores, y los QR verifican en uno o dos minutos. La clave se guarda solo en el navegador de quien la ingresa.

El historial se guarda en el navegador desde el que se emite. En **Historial** se pueden anular documentos, descargar la lista para Excel y hacer copias de respaldo.

## Privacidad

El registro público vive en un repositorio y en un sitio accesibles por cualquiera. Por eso, en **Ajustes** se elige qué se publica: nombre, rol y documento enmascarado (`12.•••.•••-5`); nombre y rol, que es la opción por defecto; o solo los datos del documento, sin información personal. El RUT o DNI completo nunca se almacena en el registro, ni siquiera localmente, y los correos electrónicos tampoco se registran. Antes de publicar nombres, conviene contar con una base de legitimidad para ello conforme a la Ley 19.628 y, desde su entrada en vigencia, la Ley 21.719 sobre protección de datos personales.

Si el repositorio es privado, GitHub Pages solo está disponible en planes de pago; en ese caso el portal sigue siendo público aunque el código no lo sea.

## Envío por correo con EmailJS

1. Crea una cuenta en emailjs.com, conecta un servicio de correo y crea una plantilla.
2. En la plantilla usa `{{to_email}}` como destinatario y `{{asunto}}` y `{{mensaje}}` como asunto y cuerpo. También están disponibles `{{to_name}}`, `{{evento}}`, `{{codigo}}`, `{{folio}}` y `{{url_verificacion}}`.
3. Para adjuntar el PDF, agrega en la plantilla un adjunto de tipo *Variable Attachment* con el nombre de parámetro `certificado`.
4. Copia *Service ID*, *Template ID* y *Public key* en **Ajustes**.

Los planes de EmailJS limitan el tamaño de cada solicitud y la cantidad de envíos, y los PDFs con fondos pesados pueden superar ese límite. En esos casos, desmarca el adjunto y envía solo el enlace de verificación. Servicios como Resend no pueden llamarse de forma segura desde el navegador, porque exigirían exponer una clave privada, y por eso no se incluyen.

## Límites conocidos

Los SVG se rasterizan a unos 300 ppp porque el formato PDF no admite SVG incrustado; los textos, rectángulos y códigos QR sí son vectoriales. Las fuentes estándar del PDF (Helvetica, Times, Courier) cubren el español y el resto del alfabeto latino occidental; para otros alfabetos, sube una fuente TTF u OTF. La lectura de Excel admite `.xlsx`; los `.xls` y `.ods` deben guardarse antes como `.xlsx` o `.csv`. Para lotes de varios cientos de documentos, usa fondos JPG livianos (menos de 1 MB), ya que el ZIP incluye el fondo en cada archivo individual.

La verificación confirma que un documento figura en el registro publicado por quien controla el repositorio. No equivale a una firma electrónica avanzada en los términos de la Ley 19.799; si se requiere ese estándar, el PDF debe firmarse después con un proveedor acreditado, lo que alterará su huella de archivo pero no su ID ni su código.

## Estructura

```
index.html, verify/index.html     páginas de la aplicación y del portal
src/lib/scene.js                  motor de maquetación compartido (vista previa y PDF)
src/lib/richtext.js               ajuste de líneas, negritas y reducción automática
src/lib/pdf.js                    generación del PDF con pdf-lib
src/lib/issue.js                  emisión de lotes, IDs, folios y huellas
src/lib/fields.js                 variables y mapeo de columnas
src/lib/presets.js                plantillas base y valores por defecto
src/components/                   editor, paneles y emisión
public/registry.json              registro público de verificación
tests/smoke.mjs                   prueba del motor
```
