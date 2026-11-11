/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PreguntaEditable, Segmento, TipoPregunta } from '../types'
import { idAleatorio } from './tiempo'

export type ClaveModelo = 'ligero' | 'equilibrado' | 'calidad'

export type OpcionModelo = {
  clave: ClaveModelo
  nombre: string
  paraQuien: string
  descarga: string
  id: string
}

// Qwen3.5 (Alibaba, licencia Apache 2.0): gratuito, multilingüe y con buen español.
// Se ejecuta con transformers.js (ONNX Runtime) en la tarjeta gráfica o, si no hay, en el procesador.
export const MODELOS: OpcionModelo[] = [
  { clave: 'ligero', nombre: 'Ligero', paraQuien: 'Móviles, tablets y portátiles sencillos', descarga: '0,7 GB', id: 'onnx-community/Qwen3.5-0.8B-ONNX-OPT' },
  { clave: 'equilibrado', nombre: 'Equilibrado', paraQuien: 'La mayoría de ordenadores', descarga: '1,8 GB', id: 'onnx-community/Qwen3.5-2B-ONNX-OPT' },
  { clave: 'calidad', nombre: 'Más calidad', paraQuien: 'Ordenadores con tarjeta gráfica', descarga: '3,3 GB', id: 'onnx-community/Qwen3.5-4B-ONNX-OPT' },
]

export type InfoDispositivo = { webgpu: boolean; movil: boolean }

export async function comprobarDispositivo(): Promise<InfoDispositivo> {
  const nav = navigator as any
  const movil =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  if (!nav.gpu) return { webgpu: false, movil }
  try {
    return { webgpu: !!(await nav.gpu.requestAdapter()), movil }
  } catch {
    return { webgpu: false, movil }
  }
}

export function modeloRecomendado(info: InfoDispositivo): ClaveModelo {
  return info.movil || !info.webgpu ? 'ligero' : 'equilibrado'
}

/* ---------- Comunicación con el hilo del modelo ---------- */

let worker: Worker | null = null
let modeloCargado: string | null = null
let siguienteId = 0
const pendientes = new Map<number, { resolver: (v: any) => void; rechazar: (e: Error) => void }>()
let alProgresar: ((proporcion: number) => void) | null = null

function obtenerWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./ia.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.tipo === 'progreso') {
      alProgresar?.(m.proporcion)
      return
    }
    const p = pendientes.get(m.id)
    if (!p) return
    pendientes.delete(m.id)
    if (m.tipo === 'error') p.rechazar(new Error(m.mensaje))
    else p.resolver(m.texto ?? true)
  }
  // Si el hilo se cae (por ejemplo, por falta de memoria), avisamos a todo lo que estaba esperando.
  worker.onerror = (e) => {
    e.preventDefault()
    pendientes.forEach((p) => p.rechazar(new Error(`device lost: el hilo del modelo se ha detenido (${e.message || 'sin detalle'})`)))
    pendientes.clear()
  }
  return worker
}

const SIN_RESPUESTA = 'TIEMPO_AGOTADO'

/** Envía un trabajo al hilo del modelo. Si pasa `limiteMs` sin respuesta, se da por perdido. */
function pedir(mensaje: Record<string, unknown>, limiteMs?: number): Promise<any> {
  const id = ++siguienteId
  return new Promise((resolver, rechazar) => {
    let reloj: ReturnType<typeof setTimeout> | undefined
    const terminar = () => clearTimeout(reloj)
    pendientes.set(id, {
      resolver: (v) => { terminar(); resolver(v) },
      rechazar: (e) => { terminar(); rechazar(e) },
    })
    if (limiteMs) {
      reloj = setTimeout(() => {
        if (!pendientes.has(id)) return
        pendientes.delete(id)
        rechazar(new Error(SIN_RESPUESTA))
      }, limiteMs)
    }
    obtenerWorker().postMessage({ ...mensaje, id })
  })
}

type Avance = (texto: string, proporcion?: number) => void
let ultimaCarga: { clave: ClaveModelo; webgpu: boolean; avance: Avance } | null = null

export async function prepararModelo(clave: ClaveModelo, webgpu: boolean, avance: Avance) {
  const { id } = MODELOS.find((m) => m.clave === clave)!
  ultimaCarga = { clave, webgpu, avance }
  if (modeloCargado === id) return
  alProgresar = (p) => avance('Cargando el modelo que escribe las preguntas (la primera vez se descarga)', p)
  avance('Preparando el modelo')
  await pedir({ tipo: 'cargar', modelo: id, dispositivo: webgpu ? 'webgpu' : 'wasm' })
  alProgresar = null
  modeloCargado = id
}

// Windows puede reiniciar el controlador de la tarjeta gráfica a mitad de trabajo ("device lost").
// Cuando pasa, el modelo queda inservible: cerramos su hilo, lo volvemos a cargar (ya está descargado) y repetimos.
// También cuando el modelo deja de responder (TIEMPO_AGOTADO): se trata igual, reiniciándolo.
const GRAFICA_PERDIDA = /device.{0,3}is lost|device lost|mapAsync|DXGI_ERROR|GPUDevice|TIEMPO_AGOTADO/i

function reiniciarHilo() {
  worker?.terminate()
  worker = null
  modeloCargado = null
  pendientes.forEach((p) => p.rechazar(new Error('Se ha reiniciado el modelo')))
  pendientes.clear()
}

async function completar(texto: string, aleatorio = false, maxTokens = 350): Promise<string> {
  // Con tarjeta gráfica, una respuesta tarda unos segundos; con el procesador, bastante más.
  const limite = ultimaCarga?.webgpu === false ? 10 * 60_000 : 2 * 60_000
  try {
    return await pedir({ tipo: 'completar', texto, aleatorio, maxTokens }, limite)
  } catch (e) {
    const mensaje = String((e as Error).message)
    if (!ultimaCarga || !GRAFICA_PERDIDA.test(mensaje)) throw e
    console.warn('El modelo ha dejado de responder o la gráfica se ha reiniciado: recargando el modelo', e)
    const { clave, webgpu, avance } = ultimaCarga
    reiniciarHilo()
    avance(
      mensaje.includes(SIN_RESPUESTA)
        ? 'El modelo no respondía. Reiniciándolo…'
        : 'La tarjeta gráfica se ha reiniciado. Recargando el modelo…',
    )
    await prepararModelo(clave, webgpu, avance)
    return await pedir({ tipo: 'completar', texto, aleatorio, maxTokens }, limite)
  }
}

/* ---------- Preguntas ---------- */

/** Algunos modelos anteponen un bloque <think></think>: lo quitamos y leemos el JSON. */
function leerJson(texto: string): any {
  const limpio = texto.replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
  const inicio = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  try {
    if (inicio < 0 || fin <= inicio) throw new Error('sin llaves')
    return JSON.parse(limpio.slice(inicio, fin + 1))
  } catch {
    throw new Error(`El modelo no devolvió JSON válido: ${texto.slice(0, 300)}`)
  }
}

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Índice del trozo (o del par de trozos seguidos) que más palabras comparte con `texto`; -1 si no se parece a ninguno. */
function buscarEnTranscripcion(textos: string[], texto: string): number {
  const palabras = new Set(normalizar(texto).split(' ').filter((p) => p.length > 2 || /\d/.test(p)))
  if (palabras.size === 0) return -1
  let mejor = -1
  let puntos = 0
  textos.forEach((t, i) => {
    // Los subtítulos cortan las frases: miramos cada trozo junto con el siguiente
    const ventana = new Set(`${t} ${textos[i + 1] ?? ''}`.split(' '))
    const coinciden = [...palabras].filter((p) => ventana.has(p)).length
    if (coinciden > puntos) { puntos = coinciden; mejor = i }
  })
  if (puntos < Math.min(2, palabras.size) && puntos / palabras.size < 0.5) return -1
  // Avanzamos al último trozo de la pareja que contiene alguna palabra buscada
  if (mejor + 1 < textos.length && textos[mejor + 1].split(' ').some((p) => palabras.has(p))) mejor++
  return mejor
}

/**
 * Decide después de qué trozo de la transcripción se para el vídeo. Combina el número de frase que da el modelo
 * con el lugar donde aparece la respuesta correcta, se queda con el más tardío (la pregunta nunca debe llegar
 * antes de que se diga el dato) y deja un trozo de margen, porque los subtítulos cortan las frases a la mitad.
 */
function localizarFrase(fragmento: Segmento[], frase: unknown, correcta: string): number {
  const textos = fragmento.map((s) => normalizar(s.texto))
  const candidatos: number[] = []
  const n = Number(frase)
  if (Number.isInteger(n) && n >= 1 && n <= fragmento.length) candidatos.push(n - 1)
  else if (typeof frase === 'string') candidatos.push(buscarEnTranscripcion(textos, frase))
  candidatos.push(buscarEnTranscripcion(textos, correcta))
  const indice = Math.max(...candidatos)
  if (indice < 0) return fragmento.length - 1
  return Math.min(indice + 1, fragmento.length - 1)
}

function citaDelVideo(fragmento: Segmento[], i: number): string {
  const trozo = fragmento.slice(Math.max(0, i - 1), i + 1).map((s) => s.texto).join(' ')
  return `En el vídeo se dice: «${trozo.replace(/\s+/g, ' ').trim()}».`
}

function mezclar<T>(lista: T[]): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

function numerar(segmentos: Segmento[]) {
  let texto = segmentos.map((s, i) => `[${i + 1}] ${s.texto}`).join('\n')
  if (texto.length > 5000) texto = texto.slice(0, 5000)
  return texto
}

function instrucciones(contexto: Segmento[], foco: number) {
  return (
    'Eres un profesor de secundaria que prepara preguntas de comprensión sobre un vídeo educativo. ' +
    'Escribe en español correcto. Usa solo información del fragmento.\n\n' +
    `Fragmento del vídeo, frase a frase:\n${numerar(contexto)}\n\n` +
    `Crea una pregunta tipo test sobre el dato importante que se explica en la frase [${foco + 1}] ` +
    '(puedes usar las frases de alrededor para entenderla).\n' +
    'Responde solo con un objeto JSON con este formato:\n' +
    `{"frase": ${foco + 1}, "pregunta": "¿...?", "correcta": "...", "incorrecta1": "...", "incorrecta2": "...", "incorrecta3": "...", "explicacion": "..."}\n` +
    '- "frase" es el NÚMERO de la frase donde termina de decirse el dato.\n' +
    '- Las tres respuestas incorrectas son creíbles, del mismo tipo que la correcta y distintas entre sí.\n' +
    '- "explicacion" explica en una frase por qué la respuesta correcta lo es.\n' +
    '- La pregunta la lee un alumno que ha visto el vídeo: no menciones números de frase, ni "el texto" ni "el fragmento".'
  )
}

/** Quita referencias a cómo se le dio el texto al modelo ("en la frase 7", "según el fragmento"...). */
function paraElAlumno(texto: string): string {
  return texto
    .replace(/\s*,?\s*\b(en|de) (la|las) frases? \[?\d+\]?(\s*(y|a)\s*\[?\d+\]?)?/gi, '')
    .replace(/\s*\(?\s*frases? \[?\d+\]?\s*\)?/gi, '')
    .replace(/\b(según|en|de) (el|este) (texto|fragmento)\b/gi, (_m, prep: string) => `${prep} el vídeo`)
    .replace(/\s+([?.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

type Borrador = { indice: number; pregunta: string; correcta: string; incorrectas: string[]; explicacion: string }

async function borradorTest(contexto: Segmento[], foco: number, aleatorio: boolean): Promise<Borrador> {
  const datos = leerJson(await completar(instrucciones(contexto, foco), aleatorio))
  const pregunta = paraElAlumno(String(datos.pregunta ?? ''))
  const correcta = String(datos.correcta ?? '').trim()
  const vistas = new Set([normalizar(correcta)])
  const incorrectas: string[] = []
  for (const x of [datos.incorrecta1, datos.incorrecta2, datos.incorrecta3]) {
    const t = String(x ?? '').trim()
    if (t && !vistas.has(normalizar(t))) {
      vistas.add(normalizar(t))
      incorrectas.push(t)
    }
  }
  if (!pregunta || !correcta || incorrectas.length < 2) throw new Error('Pregunta incompleta')
  // Nunca antes de la frase elegida: la pregunta no puede llegar antes de que se diga el dato
  const indice = Math.max(localizarFrase(contexto, datos.frase, correcta), Math.min(foco + 1, contexto.length - 1))
  const explicacion = paraElAlumno(String(datos.explicacion ?? ''))
  return {
    indice,
    pregunta,
    correcta,
    incorrectas,
    explicacion: explicacion.length > 15 ? explicacion : citaDelVideo(contexto, Math.max(foco, 0) + 1),
  }
}

/** Convierte "pregunta + respuesta" en una afirmación. Así sabemos con certeza si es verdadera o falsa. */
async function afirmacion(pregunta: string, respuesta: string): Promise<string> {
  const texto = await completar(
    'Convierte esta pregunta y su respuesta en una sola frase afirmativa, en español, sin añadir nada más.\n' +
      `Pregunta: ${pregunta}\nRespuesta: ${respuesta}\nFrase afirmativa:`,
    false,
    80,
  )
  const frase = texto.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim().split('\n')[0].replace(/^["«]|["»]$/g, '').trim()
  if (!frase || frase.length < 8) throw new Error('Afirmación vacía')
  return paraElAlumno(frase)
}

/**
 * Crea UNA pregunta sobre lo que se dice en `contexto[foco]`.
 * La pregunta aparece un segundo después de que termine de decirse el dato.
 */
export async function generarPregunta(
  contexto: Segmento[],
  foco: number,
  tipo: TipoPregunta,
  verdadera: boolean,
  intento = 0,
): Promise<PreguntaEditable> {
  const b = await borradorTest(contexto, foco, intento > 0)
  const tiempo = contexto[b.indice].fin + 1
  const base = { id: idAleatorio(), tiempo, fuente: contexto, foco }

  if (tipo === 'test') {
    const opciones = mezclar([b.correcta, ...b.incorrectas])
    return { ...base, tipo: 'test', enunciado: b.pregunta, opciones, correcta: opciones.indexOf(b.correcta), explicacion: b.explicacion }
  }

  const enunciado = await afirmacion(b.pregunta, verdadera ? b.correcta : b.incorrectas[0])
  return {
    ...base,
    tipo: 'vf',
    enunciado,
    opciones: ['Verdadero', 'Falso'],
    correcta: verdadera ? 0 : 1,
    explicacion: `La respuesta correcta a «${b.pregunta}» es: ${b.correcta}. ${b.explicacion}`,
  }
}

/* ---------- Análisis de la transcripción: dónde están los datos importantes ---------- */

// Partes que nunca merecen pregunta: saludos, despedidas, autopromoción.
const RELLENO = /suscr[ií]b|campanita|dale (a )?like|comenta|bienvenid|hola (chicos|a todos|amigos)|gracias por ver|much[ií]simas gracias|hasta (la )?pr[oó]xima|hasta pronto|nos vemos|redes sociales|patreon|instagram|tiktok|enlace en la descripci/i
// Pistas de que se está explicando un dato: cifras, fechas, definiciones, causas, personas...
const PISTAS = /\d|\bsiglos?\b|\baños?\b|llam(a|an|ó|aron|ado|ada)\b|se conoce|conocid[oa]|signific|consist|defin|invent|descubr|fund(ó|aron)|cre(ó|aron)|primer[oa]?|origen|caus|consecuen|import|principal|caracter[ií]stic|tipos? de|se divide|está formad/i

function puntosPorTexto(s: Segmento, duracion: number): number {
  let puntos = 0
  if (PISTAS.test(s.texto)) puntos += 1
  if (/\d/.test(s.texto)) puntos += 0.5
  if (RELLENO.test(s.texto)) puntos -= 4
  if (s.inicio < 15 || s.fin > duracion - 10) puntos -= 2
  return puntos
}

/** Bloques de ~1.300 caracteres para que el modelo los lea de una vez. */
function bloquesDeLectura(segmentos: Segmento[]): number[][] {
  const bloques: number[][] = []
  let actual: number[] = []
  let largo = 0
  segmentos.forEach((s, i) => {
    actual.push(i)
    largo += s.texto.length
    if (largo > 1300) {
      bloques.push(actual)
      actual = []
      largo = 0
    }
  })
  if (actual.length) bloques.push(actual)
  return bloques
}

/**
 * La IA lee toda la transcripción por bloques y marca las frases con datos que un alumno debería recordar.
 * Devuelve cada trozo de la transcripción con su puntuación, de más a menos importante.
 */
async function analizarTranscripcion(
  segmentos: Segmento[],
  alAvanzar: (hecho: number, total: number) => void,
  cancelado: () => boolean,
): Promise<{ indice: number; puntos: number }[]> {
  const duracion = segmentos[segmentos.length - 1]?.fin ?? 0
  const puntos = segmentos.map((s) => puntosPorTexto(s, duracion))
  const bloques = bloquesDeLectura(segmentos)

  for (let b = 0; b < bloques.length && !cancelado(); b++) {
    alAvanzar(b, bloques.length)
    const bloque = bloques[b].map((i) => segmentos[i])
    try {
      const respuesta = await completar(
        'Eres un profesor de secundaria. Este es un fragmento de la transcripción de un vídeo educativo, frase a frase:\n' +
          `${numerar(bloque)}\n\n` +
          '¿En qué frases se explica un dato importante que un alumno debería recordar (una fecha, una definición, ' +
          'un nombre, una causa, una característica...)? Ignora saludos, despedidas, bromas y ejemplos sin importancia.\n' +
          'Responde solo con JSON: {"importantes": [números de frase, del más al menos importante, como mucho 3]}. ' +
          'Si no hay ninguno, responde {"importantes": []}.',
        false,
        60,
      )
      const lista: unknown[] = leerJson(respuesta).importantes ?? []
      lista.slice(0, 3).forEach((n, orden) => {
        const local = Number(n) - 1
        if (Number.isInteger(local) && local >= 0 && local < bloque.length) puntos[bloques[b][local]] += 4 - orden
      })
    } catch (e) {
      console.warn('No se pudo analizar un bloque; se usa solo la puntuación por texto', e)
    }
  }
  alAvanzar(bloques.length, bloques.length)
  return puntos.map((p, indice) => ({ indice, puntos: p })).sort((a, b) => b.puntos - a.puntos)
}

/** Frases de alrededor que se le dan al modelo para que entienda el dato. */
function contextoDe(segmentos: Segmento[], indice: number) {
  const desde = Math.max(0, indice - 6)
  const hasta = Math.min(segmentos.length, indice + 3)
  return { contexto: segmentos.slice(desde, hasta), foco: indice - desde }
}

type OpcionesGeneracion = {
  segmentos: Segmento[]
  cantidad: number
  tipos: TipoPregunta[]
  alAvanzar: (texto: string, proporcion?: number) => void
  alCrear: (p: PreguntaEditable) => void
  cancelado: () => boolean
}

/**
 * Crea exactamente `cantidad` preguntas (si el vídeo da para ello), colocadas donde se explican los datos
 * más importantes y repartidas por el vídeo. Si un dato no da para una buena pregunta, pasa al siguiente.
 */
export async function generarPreguntas({ segmentos, cantidad, tipos, alAvanzar, alCrear, cancelado }: OpcionesGeneracion) {
  const candidatos = await analizarTranscripcion(
    segmentos,
    (hecho, total) => alAvanzar(`Leyendo el vídeo para encontrar los datos importantes (${hecho} de ${total})`, (hecho / total) * 0.3),
    cancelado,
  )
  const duracion = segmentos[segmentos.length - 1]?.fin ?? 0
  const elegidos: number[] = []
  const probados = new Set<number>()
  // Separación mínima entre preguntas: se relaja si no hay suficientes datos bien repartidos
  let separacion = duracion / (cantidad * 1.8)
  let creadas = 0
  let fallosSeguidos = 0
  let ultimoFallo = ''

  while (creadas < cantidad && !cancelado()) {
    // Si la IA no consigue ninguna pregunta válida varias veces seguidas, algo va mal: mejor parar y avisar.
    if (fallosSeguidos >= 4) {
      throw new Error(
        `el modelo no está devolviendo preguntas válidas (${fallosSeguidos} intentos seguidos). ` +
          `Prueba con otro modelo. Detalle: ${ultimoFallo.slice(0, 160)}`,
      )
    }
    const candidato = candidatos.find(
      (c) =>
        !probados.has(c.indice) &&
        elegidos.every((e) => Math.abs(segmentos[e].inicio - segmentos[c.indice].inicio) >= separacion),
    )
    if (!candidato) {
      if (separacion < 4) break
      separacion /= 2
      continue
    }
    probados.add(candidato.indice)
    const progreso = 0.3 + (creadas / cantidad) * 0.7
    alAvanzar(
      `Escribiendo la pregunta ${creadas + 1} de ${cantidad}${fallosSeguidos ? ' (probando con otro dato del vídeo)' : ''}`,
      progreso,
    )

    const tipo = tipos[creadas % tipos.length]
    const { contexto, foco } = contextoDe(segmentos, candidato.indice)
    let conseguida = false
    for (let intento = 0; intento < 2 && !cancelado() && !conseguida; intento++) {
      try {
        const p = await generarPregunta(contexto, foco, tipo, Math.random() < 0.5, intento)
        elegidos.push(candidato.indice)
        creadas++
        alCrear(p)
        conseguida = true
      } catch (e) {
        ultimoFallo = String((e as Error).message)
        console.warn('Pregunta descartada', e)
      }
    }
    fallosSeguidos = conseguida ? 0 : fallosSeguidos + 1
  }
  return creadas
}

/** Sugerencia inicial: una pregunta cada minuto y medio, entre 3 y 15. */
export function cantidadSugerida(duracion: number) {
  return Math.min(15, Math.max(3, Math.round(duracion / 90)))
}
