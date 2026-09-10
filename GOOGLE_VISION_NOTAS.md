# Búsqueda de unidad por patente (cámara) — notas de Google Cloud Vision

Estado actual (2026-09-09): la función de escanear patente con cámara usa
**Tesseract.js** (OCR local, en el navegador, gratis, sin backend). El código
para usar **Google Cloud Vision** (más preciso, pero pago) ya está escrito y
listo — solo hay que resolver la facturación de Google para volver a activarlo.

## Por qué se cambió a Tesseract.js

Google Cloud Vision requiere una cuenta de facturación de Google Cloud activa
vinculada al proyecto. Se intentó activarla y se encontraron dos problemas
distintos, en este orden:

1. El proyecto donde se creó la API key (`My First Project`, número de
   proyecto `372466448620`, ID `lunar-inn-497613-s3`) tenía vinculada una
   cuenta de facturación (`01F64A-379050-6296C7`) que estaba **cerrada**
   (el free trial había terminado).
2. Se intentó reabrir esa cuenta desde la consola — Google no lo permite
   (el ícono de "reabrir" aparece deshabilitado).
3. Se creó una cuenta de facturación nueva (`01054C-E66138-286694`), se
   confirmó el prepago de USD 30 y por un momento apareció como "Cuenta
   pagada" — pero al volver a entrar, **también aparece cerrada**. No se
   pudo determinar la causa exacta (puede ser un problema del lado de
   Google con el método de pago, o alguna verificación pendiente de la
   cuenta `andescheck.com`).

Ante esto, se decidió no seguir invirtiendo tiempo en depurar la facturación
de Google y usar OCR local mientras tanto.

## Cómo volver a activar Google Cloud Vision cuando se resuelva la facturación

1. Confirmar que hay una cuenta de facturación de Google Cloud **activa** (no
   cerrada) vinculada al proyecto que tiene habilitada la API de Vision.
   - Chequear en <https://console.cloud.google.com/billing> → "Tus cuentas
     de facturación" que el estado sea "Abierta"/activa, no "Cerrada".
   - Vincularla en "Tus proyectos" → fila del proyecto → Acciones (⋮) →
     "Cambiar cuenta de facturación".
2. La API key de Google Vision ya está guardada en Vercel como variable de
   entorno `GOOGLE_VISION_API_KEY` (Settings → Environment Variables). No
   hace falta tocarla si sigue siendo válida; si se regeneró, actualizarla
   ahí y volver a hacer deploy.
3. El backend ya existe y no se tocó: [app/api/leer-patente.js](app/api/leer-patente.js)
   (función serverless de Vercel, valida el JWT de Supabase, llama a
   `vision.googleapis.com/v1/images:annotate`, extrae la patente con regex).
4. En [app/src/components/EscanearPatenteModal.jsx](app/src/components/EscanearPatenteModal.jsx),
   volver a llamar a `fetch('/api/leer-patente', ...)` en vez de la función
   local de Tesseract (la lógica de las dos vive en el mismo archivo,
   comentada/documentada — ver el comentario `// Google Vision (pago, más preciso)`).

## Tesseract.js (implementación actual)

- Corre 100% en el navegador del usuario, sin mandar la foto a ningún
  servidor. Usa el paquete `tesseract.js` (dependencia npm agregada).
- Carga el modelo de idioma bajo demanda (`import()` dinámico) para no
  inflar el bundle principal — solo se descarga cuando el usuario abre el
  escáner de patente.
- Es más lento (varios segundos) y algo menos preciso con fotos borrosas o
  en ángulo que Google Vision, pero funciona sin costo y sin configuración
  externa.
