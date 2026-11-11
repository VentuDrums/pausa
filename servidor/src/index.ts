/**
 * Intermediario de Pausa en Cloudflare Workers.
 *
 * Recibe el texto que Pausa quiere que la IA complete, se lo pasa a Qwen3 30B (Workers AI, con la cuota
 * gratuita de la cuenta) y devuelve la respuesta. No hay claves: el Worker usa la IA de su propia cuenta.
 *
 * Protecciones para que nadie gaste la cuota desde fuera:
 *  - solo responde a las páginas de Pausa (cabecera Origin),
 *  - limita el tamaño de lo que se envía y de lo que se escribe.
 */

export interface Env {
  AI: Ai
}

const MODELO = '@cf/qwen/qwen3-30b-a3b-fp8'

const ORIGENES = new Set([
  'https://ventudrums.github.io',
  'http://localhost:5180',
  'http://localhost:5173',
  'http://localhost:4173',
])

const MAX_ENTRADA = 20_000 // caracteres
const MAX_SALIDA = 1_500 // tokens

function cabeceras(origen: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(cuerpo: unknown, estado: number, origen: string) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras(origen) },
  })
}

/** Workers AI puede devolver el formato clásico ({response}) o el de OpenAI ({choices}). */
function extraerTexto(salida: any): string {
  const texto =
    typeof salida?.response === 'string'
      ? salida.response
      : salida?.choices?.[0]?.message?.content ?? salida?.choices?.[0]?.text ?? ''
  // Por si el modelo razona en voz alta a pesar de pedirle que no.
  return String(texto).replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
}

/**
 * Vídeos de Google Drive: Google rechaza (503) que un navegador los reproduzca desde otra web,
 * pero sí los sirve a un servidor. Este camino los pide a Google y los pasa tal cual, respetando
 * los saltos (cabecera Range) para que el alumno pueda moverse por el vídeo.
 * Solo atiende a las páginas de Pausa (cabecera Referer) y solo a archivos de Drive.
 */
async function videoDeDrive(peticion: Request, id: string): Promise<Response> {
  const referer = peticion.headers.get('Referer') ?? ''
  const permitido = [...ORIGENES].some((o) => referer.startsWith(`${o}/`))
  if (!permitido) return new Response('No permitido', { status: 403 })
  if (!/^[\w-]{10,100}$/.test(id)) return new Response('Identificador no válido', { status: 400 })

  const cabeceras = new Headers()
  const rango = peticion.headers.get('Range')
  if (rango) cabeceras.set('Range', rango)
  const respuesta = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, {
    headers: cabeceras,
  })
  const tipo = respuesta.headers.get('Content-Type') ?? ''
  // Si Google devuelve una página (archivo privado, borrado o con demasiadas descargas), no es un vídeo.
  if (!respuesta.ok || tipo.startsWith('text/html')) {
    return new Response('El vídeo de Drive no está disponible', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  const salida = new Headers({ 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' })
  for (const c of ['Content-Type', 'Content-Length', 'Content-Range']) {
    const valor = respuesta.headers.get(c)
    if (valor) salida.set(c, valor)
  }
  return new Response(respuesta.body, { status: respuesta.status, headers: salida })
}

export default {
  async fetch(peticion: Request, env: Env): Promise<Response> {
    const ruta = new URL(peticion.url).pathname
    const drive = ruta.match(/^\/drive\/([^/]+)$/)
    if (drive && (peticion.method === 'GET' || peticion.method === 'HEAD')) return videoDeDrive(peticion, drive[1])

    const origen = peticion.headers.get('Origin') ?? ''
    if (!ORIGENES.has(origen)) return new Response('No permitido', { status: 403 })
    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabeceras(origen) })
    if (peticion.method !== 'POST') return json({ error: 'metodo' }, 405, origen)

    let datos: { texto?: unknown; aleatorio?: unknown; maxTokens?: unknown }
    try {
      datos = await peticion.json()
    } catch {
      return json({ error: 'json' }, 400, origen)
    }
    const texto = typeof datos.texto === 'string' ? datos.texto : ''
    if (!texto || texto.length > MAX_ENTRADA) return json({ error: 'tamano' }, 413, origen)
    const maxTokens = Math.min(Math.max(Number(datos.maxTokens) || 400, 16), MAX_SALIDA)
    const aleatorio = datos.aleatorio === true

    try {
      const salida = await env.AI.run(MODELO as any, {
        // "/no_think" desactiva el razonamiento de Qwen3: así responde directo y gasta mucha menos cuota.
        messages: [{ role: 'user', content: `${texto}\n/no_think` }],
        max_tokens: maxTokens,
        temperature: aleatorio ? 0.7 : 0.2,
        top_p: 0.8,
      } as any)
      return json({ texto: extraerTexto(salida) }, 200, origen)
    } catch (e) {
      const mensaje = String((e as Error)?.message ?? e)
      // Cuota diaria gratuita agotada (se reinicia a las 00:00 UTC) u otro fallo de Workers AI.
      const cuota = /neuron|quota|limit|4006|exceeded/i.test(mensaje)
      return json({ error: cuota ? 'cuota' : 'ia', detalle: mensaje.slice(0, 300) }, cuota ? 429 : 502, origen)
    }
  },
} satisfies ExportedHandler<Env>
