# Pausa — vídeos que preguntan

Convierte un vídeo de YouTube en una actividad interactiva: el vídeo se detiene para hacer preguntas
(tipo test o verdadero/falso) y al final el alumno ve su informe y lo envía al profesor por correo o en PDF.

- **Sin servidor ni cuentas**: la actividad viaja comprimida dentro del enlace (`#/ver/...`).
- **IA gratuita en el navegador** con [transformers.js](https://huggingface.co/docs/transformers.js):
  - Transcripción: Whisper base (solo si se sube el MP4).
  - Preguntas: Qwen3.5 0.8B / 2B / 4B (ONNX, q4), en la tarjeta gráfica (WebGPU) o en el procesador.
- Los alumnos no descargan ninguna IA: su página pesa ~80 KB.
- **Transcripción desde YouTube** con el marcador «Enviar a Pausa» (`src/lib/marcador.ts`): YouTube bloquea que
  otras webs lean sus transcripciones, así que el marcador las lee desde la propia página de YouTube.
- **Preguntas por contenido**: la IA lee toda la transcripción, puntúa los datos importantes y crea exactamente
  el número de preguntas pedido, repartidas por el vídeo (`generarPreguntas` en `src/lib/ia.ts`).
- **Análisis del dispositivo** (`src/lib/dispositivo.ts`): mide los GFLOPS de la gráfica con WebGPU y recomienda modelo.
- Si Windows reinicia el controlador de la gráfica a mitad de trabajo ("device lost"), el modelo se recarga solo.

## Arrancar en local

```bash
npm install
npm run dev
```

## Publicar gratis

```bash
npm run build
```

Sube la carpeta `dist/` a cualquier hosting estático (Netlify Drop, GitHub Pages, Vercel...).
Tiene que ser HTTPS para que funcionen la IA y el botón de copiar.

## IA en la nube (Cloudflare)

Por defecto, las preguntas las escribe **Qwen3 30B** en Cloudflare Workers AI, con el cupo gratuito diario de la cuenta
(10.000 «neuronas», unas 45 actividades de 7 preguntas al día). Pausa llama a un pequeño intermediario que está en
`servidor/`: solo atiende peticiones de las páginas de Pausa y no necesita claves. Si el cupo se agota o la nube no
responde, Pausa usa el modelo del navegador.

Para publicar cambios del intermediario:

```bash
cd servidor
npx wrangler deploy
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/pages/Crear.tsx` | Pantalla del profesor (4 pasos) |
| `src/pages/Ver.tsx` | Pantalla del alumno e informe final |
| `src/lib/ia.ts`, `src/lib/ia.worker.ts` | Generación de preguntas con Qwen3.5 |
| `src/lib/whisper.ts`, `src/lib/whisper.worker.ts` | Transcripción del MP4 con Whisper |
| `src/lib/transcripcion.ts` | Lee la transcripción pegada de YouTube o .srt/.vtt |
| `src/lib/compartir.ts` | Mete y saca la actividad del enlace |
| `src/lib/informe.ts` | Nota, correo prerrellenado y PDF |

## Nota técnica

WebLLM se descartó: en gráficas NVIDIA serie 50 (Blackwell) producía texto sin sentido. ONNX Runtime Web
(transformers.js) funciona bien en el mismo equipo.
