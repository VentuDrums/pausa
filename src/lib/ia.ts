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
type Pendiente = { resolver: (v: any) => void; rechazar: (e: Error) => void; reavivar: () => void }
const pendientes = new Map<number, Pendiente>()
let alProgresar: ((proporcion: number) => void) | null = null

function obtenerWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./ia.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.tipo === 'progreso' || m.tipo === 'latido') {
      // Sigue vivo: reiniciamos el reloj de inactividad de lo que esté esperando.
      pendientes.forEach((p) => p.reavivar())
      if (m.tipo === 'progreso') alProgresar?.(m.proporcion)
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

/**
 * Envía un trabajo al hilo del modelo. Si pasan `inactividadMs` sin ninguna señal de vida
 * (progreso de descarga o palabras escritas), se da por perdido.
 */
function pedir(mensaje: Record<string, unknown>, inactividadMs?: number): Promise<any> {
  const id = ++siguienteId
  return new Promise((resolver, rechazar) => {
    let reloj: ReturnType<typeof setTimeout> | undefined
    const armar = () => {
      if (!inactividadMs) return
      clearTimeout(reloj)
      reloj = setTimeout(() => {
        if (!pendientes.has(id)) return
        pendientes.delete(id)
        rechazar(new Error(SIN_RESPUESTA))
      }, inactividadMs)
    }
    pendientes.set(id, {
      resolver: (v) => { clearTimeout(reloj); resolver(v) },
      rechazar: (e) => { clearTimeout(reloj); rechazar(e) },
      reavivar: armar,
    })
    armar()
    obtenerWorker().postMessage({ ...mensaje, id })
  })
}

type Avance = (texto: string, proporcion?: number) => void
let ultimaCarga: { clave: ClaveModelo; avance: Avance } | null = null

// Motor en uso. Empieza con la tarjeta gráfica si la hay; si en este dispositivo se cuelga o falla,
// pasamos al procesador (más lento, pero funciona en todas partes) y lo recordamos para la próxima vez.
const CLAVE_SIN_GRAFICA = 'pausa-sin-grafica-v1'
let usarGrafica = true
try { usarGrafica = localStorage.getItem(CLAVE_SIN_GRAFICA) !== '1' } catch { /* sin almacenamiento */ }
let motor: 'webgpu' | 'wasm' | null = null // null = aún no se ha cargado ningún modelo en el navegador

/** Sin señales de vida durante este tiempo, el modelo se da por colgado. */
const inactividad = () => (motor === 'webgpu' ? 90_000 : 5 * 60_000)

function renunciarAGrafica() {
  usarGrafica = false
  try { localStorage.setItem(CLAVE_SIN_GRAFICA, '1') } catch { /* sin almacenamiento */ }
}

function reiniciarHilo() {
  worker?.terminate()
  worker = null
  modeloCargado = null
  pendientes.forEach((p) => p.rechazar(new Error('Se ha reiniciado el modelo')))
  pendientes.clear()
}

async function cargarCon(id: string, avance: Avance) {
  alProgresar = (p) =>
    p >= 0.995
      ? avance('Poniendo en marcha el modelo en este dispositivo (puede tardar un poco)…')
      : avance('Descargando el modelo que escribe las preguntas (solo la primera vez)', p)
  try {
    await pedir({ tipo: 'cargar', modelo: id, dispositivo: motor }, inactividad())
  } finally {
    alProgresar = null
  }
}

export async function prepararModelo(clave: ClaveModelo, webgpu: boolean, avance: Avance) {
  const { id } = MODELOS.find((m) => m.clave === clave)!
  ultimaCarga = { clave, avance }
  const deseado = webgpu && usarGrafica ? 'webgpu' : 'wasm'
  if (modeloCargado === id && motor === deseado) return
  if (modeloCargado) reiniciarHilo()
  motor = deseado
  avance('Preparando el modelo')
  try {
    await cargarCon(id, avance)
  } catch (e) {
    if (motor !== 'webgpu') throw e
    // La gráfica de este dispositivo no ha podido arrancar el modelo: probamos con el procesador.
    console.warn('El modelo no arranca con la tarjeta gráfica; se prueba con el procesador', e)
    reiniciarHilo()
    renunciarAGrafica()
    motor = 'wasm'
    avance('La tarjeta gráfica no ha podido con el modelo. Usando el procesador (más lento)…')
    await cargarCon(id, avance)
  }
  modeloCargado = id
}

/** Vuelve a dar una oportunidad a la tarjeta gráfica (al analizar de nuevo el dispositivo). */
export function volverAProbarGrafica() {
  usarGrafica = true
  try { localStorage.removeItem(CLAVE_SIN_GRAFICA) } catch { /* sin almacenamiento */ }
}

/** Si la tarjeta gráfica falló antes en este dispositivo y ahora se usa el procesador. */
export function graficaDescartada(): boolean {
  return !usarGrafica
}

/** Para mostrar al profesor con qué se está generando. */
export function motorActual(): 'webgpu' | 'wasm' | 'nube' | null {
  return enNube ? 'nube' : motor
}

// Windows puede reiniciar el controlador de la tarjeta gráfica a mitad de trabajo ("device lost").
// Cuando pasa, el modelo queda inservible: cerramos su hilo, lo volvemos a cargar (ya está descargado) y repetimos.
// Si lo que pasa es que deja de responder (TIEMPO_AGOTADO) con la gráfica, pasamos al procesador.
const GRAFICA_PERDIDA = /device.{0,3}is lost|device lost|mapAsync|DXGI_ERROR|GPUDevice|TIEMPO_AGOTADO/i

/* ---------- IA en la nube (Cloudflare Workers AI, Qwen3 30B) ---------- */

// Intermediario publicado desde la carpeta `servidor/`. Usa el cupo gratuito diario de Cloudflare,
// compartido por todos los profesores; si se agota o falla, Pausa sigue con el modelo del navegador.
const URL_NUBE = 'https://pausa-ia.pausa-ventudrums.workers.dev'
const CLAVE_NUBE_AGOTADA = 'pausa-nube-agotada-v1'

let enNube = false
let reservaWebgpu = false

/** El cupo de Cloudflare se reinicia cada día a las 00:00 UTC. */
const hoyUTC = () => new Date().toISOString().slice(0, 10)

function nubeAgotadaHoy(): boolean {
  try { return localStorage.getItem(CLAVE_NUBE_AGOTADA) === hoyUTC() } catch { return false }
}

function marcarNubeAgotada() {
  try { localStorage.setItem(CLAVE_NUBE_AGOTADA, hoyUTC()) } catch { /* sin almacenamiento */ }
}

/** Si el cupo gratuito de hoy ya se gastó (para avisar al profesor antes de empezar). */
export function nubeDisponibleHoy(): boolean {
  return !nubeAgotadaHoy()
}

/**
 * Deja la IA lista. Con `nube`, no descarga nada: usa el servidor y solo carga el modelo
 * del navegador (`clave`) si la nube no está disponible.
 */
export async function prepararIA(opciones: { nube: boolean; clave: ClaveModelo; webgpu: boolean; avance: Avance }) {
  const { nube, clave, webgpu, avance } = opciones
  ultimaCarga = { clave, avance }
  reservaWebgpu = webgpu
  if (nube && !nubeAgotadaHoy()) {
    enNube = true
    return
  }
  enNube = false
  if (nube) avance('El cupo gratuito de hoy de la IA en la nube se ha agotado. Usando el modelo de tu navegador…')
  await prepararModelo(clave, webgpu, avance)
}

class ErrorNube extends Error {
  tipo: 'cuota' | 'otro'
  constructor(tipo: 'cuota' | 'otro', mensaje: string) {
    super(mensaje)
    this.tipo = tipo
  }
}

async function pedirANube(texto: string, aleatorio: boolean, maxTokens: number): Promise<string> {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 90_000)
  try {
    const r = await fetch(URL_NUBE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, aleatorio, maxTokens }),
      signal: control.signal,
    })
    const datos = await r.json().catch(() => ({}))
    if (r.status === 429 || datos.error === 'cuota') throw new ErrorNube('cuota', 'Cupo diario agotado')
    if (!r.ok || typeof datos.texto !== 'string') throw new ErrorNube('otro', `${r.status} ${datos.error ?? ''} ${datos.detalle ?? ''}`)
    return datos.texto
  } catch (e) {
    if (e instanceof ErrorNube) throw e
    throw new ErrorNube('otro', String((e as Error)?.message ?? e))
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Pide la respuesta a la nube (con un reintento si falla algo puntual).
 * Si no hay manera, cambia al modelo del navegador y devuelve null para que lo use.
 */
async function completarEnNube(texto: string, aleatorio: boolean, maxTokens: number): Promise<string | null> {
  for (let intento = 0; intento < 2; intento++) {
    try {
      return await pedirANube(texto, aleatorio, maxTokens)
    } catch (e) {
      const err = e as ErrorNube
      console.warn('La IA en la nube ha fallado', err)
      if (err.tipo === 'cuota') {
        marcarNubeAgotada()
        break
      }
      if (intento === 0) await new Promise((r) => setTimeout(r, 2000))
    }
  }
  enNube = false
  const { clave, avance } = ultimaCarga!
  avance(
    nubeAgotadaHoy()
      ? 'El cupo gratuito de hoy de la IA en la nube se ha agotado. Usando el modelo de tu navegador…'
      : 'La IA en la nube no responde. Usando el modelo de tu navegador…',
  )
  await prepararModelo(clave, reservaWebgpu, avance)
  return null
}

async function completar(texto: string, aleatorio = false, maxTokens = 350): Promise<string> {
  if (enNube) {
    const desdeNube = await completarEnNube(texto, aleatorio, maxTokens)
    if (desdeNube !== null) return desdeNube
  }
  try {
    return await pedir({ tipo: 'completar', texto, aleatorio, maxTokens }, inactividad())
  } catch (e) {
    const mensaje = String((e as Error).message)
    if (!ultimaCarga || !GRAFICA_PERDIDA.test(mensaje)) throw e
    const colgado = mensaje.includes(SIN_RESPUESTA)
    console.warn('El modelo ha dejado de responder o la gráfica se ha reiniciado: recargando el modelo', e)
    const { clave, avance } = ultimaCarga
    const conGrafica = motor === 'webgpu'
    reiniciarHilo()
    if (colgado && conGrafica) {
      renunciarAGrafica()
      avance('La tarjeta gráfica no respondía. Cambiando al procesador (más lento)…')
    } else {
      avance(colgado ? 'El modelo no respondía. Reiniciándolo…' : 'La tarjeta gráfica se ha reiniciado. Recargando el modelo…')
    }
    await prepararModelo(clave, conGrafica && !colgado, avance)
    return await pedir({ tipo: 'completar', texto, aleatorio, maxTokens }, inactividad())
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

/* ---------- Nivel educativo ---------- */

export type Nivel = 'primaria' | 'eso' | 'bachillerato'

export const NIVELES: { clave: Nivel; nombre: string; edades: string }[] = [
  { clave: 'primaria', nombre: 'Primaria', edades: '6 a 12 años' },
  { clave: 'eso', nombre: 'ESO', edades: '12 a 16 años' },
  { clave: 'bachillerato', nombre: 'Bachillerato', edades: '16 a 18 años' },
]

/** Cómo debe escribir la IA para cada etapa. */
const GUIA_NIVEL: Record<Nivel, { profesor: string; reglas: string }> = {
  primaria: {
    profesor: 'un maestro de Educación Primaria (alumnos de 6 a 12 años)',
    reglas:
      '- Usa palabras sencillas y frases cortas, como hablaría un maestro a niños.\n' +
      '- Pregunta por un dato concreto que se dice claramente en el vídeo (qué, quién, cuándo, dónde, cómo se llama).\n' +
      '- Las respuestas son cortas (unas pocas palabras). Las incorrectas son creíbles pero claramente distintas de la correcta.\n' +
      '- La explicación es una frase sencilla y cercana, sin palabras técnicas.',
  },
  eso: {
    profesor: 'un profesor de Educación Secundaria Obligatoria (alumnos de 12 a 16 años)',
    reglas:
      '- Usa un lenguaje claro y el vocabulario propio de la materia que aparece en el vídeo.\n' +
      '- Pregunta por un dato importante o por su sentido (qué es, por qué ocurre, para qué sirve).\n' +
      '- Las respuestas incorrectas son creíbles y del mismo tipo que la correcta.\n' +
      '- La explicación dice en una frase por qué la respuesta correcta lo es.',
  },
  bachillerato: {
    profesor: 'un profesor de Bachillerato (alumnos de 16 a 18 años)',
    reglas:
      '- Usa el vocabulario académico de la materia con precisión.\n' +
      '- Mejor que un dato suelto, pregunta por la comprensión: causas y consecuencias, relaciones entre ideas, ' +
      'comparaciones o el significado de un concepto que se explica en el vídeo. La respuesta tiene que estar en el vídeo.\n' +
      '- Las respuestas incorrectas son sutiles: errores o confusiones habituales sobre el tema, no opciones absurdas.\n' +
      '- La explicación es precisa y aclara el concepto en una o dos frases.',
  },
}

function instrucciones(contexto: Segmento[], foco: number, nivel: Nivel) {
  const guia = GUIA_NIVEL[nivel]
  return (
    `Eres ${guia.profesor} que prepara preguntas de comprensión sobre un vídeo educativo. ` +
    'Escribe en español correcto. Usa solo información del fragmento.\n\n' +
    `Fragmento del vídeo, frase a frase:\n${numerar(contexto)}\n\n` +
    `Crea una pregunta tipo test sobre el dato importante que se explica en la frase [${foco + 1}] ` +
    '(puedes usar las frases de alrededor para entenderla).\n' +
    'Responde solo con un objeto JSON con este formato:\n' +
    `{"frase": ${foco + 1}, "pregunta": "¿...?", "correcta": "...", "incorrecta1": "...", "incorrecta2": "...", "incorrecta3": "...", "explicacion": "..."}\n` +
    '- "frase" es el NÚMERO de la frase donde termina de decirse el dato.\n' +
    '- Las tres respuestas incorrectas son distintas entre sí y ninguna es también correcta.\n' +
    `${guia.reglas}\n` +
    '- La pregunta la lee un alumno que ha visto el vídeo: no menciones números de frase, ni "el texto" ni "el fragmento".'
  )
}

/** Quita referencias a cómo se le dio el texto al modelo ("en la frase 7", "según el fragmento"...). */
function paraElAlumno(texto: string): string {
  const mayus = (m: string, t: string) => (/^[A-ZÁÉÍÓÚ]/.test(m) ? t[0].toUpperCase() + t.slice(1) : t)
  return texto
    // "La frase 5 indica…" → "El vídeo indica…"
    .replace(/\b(la|esta) frases?(?: \[?\d+\]?)?(?=\s+(indica|menciona|dice|señala|explica|afirma|muestra|habla|cuenta)\b)/gi, (m) =>
      mayus(m, 'el vídeo'))
    // "como dice la frase 4" → "como dice el vídeo"
    .replace(/\b(dice|indica|menciona|explica|señala|afirma|muestra) (la|esta) frases?(?: \[?\d+\]?)?/gi, (_m, verbo: string) => `${verbo} el vídeo`)
    .replace(/\s*,?\s*\b(en|de) (la|las) frases? \[?\d+\]?(\s*(y|a)\s*\[?\d+\]?)?/gi, '')
    // "mencionada en la frase" → "mencionada en el vídeo"
    .replace(/\b(en|de) (la|esta) frase\b/gi, (_m, prep: string) => (prep.toLowerCase() === 'de' ? 'del vídeo' : `${prep} el vídeo`))
    .replace(/\s*\(?\s*frases? \[?\d+\]?\s*\)?/gi, ' ')
    .replace(/\b(según|en|de) (el|este) (texto|fragmento)\b/gi, (_m, prep: string) => `${prep} el vídeo`)
    .replace(/\b(el|este) (texto|fragmento)\b/gi, (m) => mayus(m, 'el vídeo'))
    // El modelo pequeño a veces remata la afirmación con "…, por lo que la respuesta es afirmativa".
    .replace(/\s*,?\s*(por lo que|así que|por tanto,?|luego)\s+(la respuesta|esto|esta afirmación|la afirmación)\s+es\s+(afirmativa|negativa|verdadera|falsa|correcta|incorrecta|cierta)\b/gi, '')
    .replace(/\s+([?.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Si al quitar algo la frase ha quedado empezando en minúscula.
    .replace(/^([¿¡]?)([a-záéíóúñ])/, (_m, signo: string, letra: string) => signo + letra.toUpperCase())
}

type Borrador = { indice: number; pregunta: string; correcta: string; incorrectas: string[]; explicacion: string }

async function borradorTest(contexto: Segmento[], foco: number, aleatorio: boolean, nivel: Nivel): Promise<Borrador> {
  const datos = leerJson(await completar(instrucciones(contexto, foco, nivel), aleatorio))
  const pregunta = paraElAlumno(String(datos.pregunta ?? ''))
  // Las opciones siempre empiezan en mayúscula ("la reconquista" → "La reconquista").
  const opcion = (x: unknown) => {
    const t = String(x ?? '').trim()
    return t.charAt(0).toLocaleUpperCase('es') + t.slice(1)
  }
  const correcta = opcion(datos.correcta)
  const vistas = new Set([normalizar(correcta)])
  const incorrectas: string[] = []
  for (const x of [datos.incorrecta1, datos.incorrecta2, datos.incorrecta3]) {
    const t = opcion(x)
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
    // El nivel ya se nota en la pregunta de la que sale. (Si se le añade aquí, el modelo lo copia en la frase.)
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
  nivel: Nivel = 'eso',
): Promise<PreguntaEditable> {
  const b = await borradorTest(contexto, foco, intento > 0, nivel)
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
  nivel: Nivel
  alAvanzar: (texto: string, proporcion?: number) => void
  alCrear: (p: PreguntaEditable) => void
  cancelado: () => boolean
}

/**
 * Crea exactamente `cantidad` preguntas (si el vídeo da para ello), colocadas donde se explican los datos
 * más importantes y repartidas por el vídeo. Si un dato no da para una buena pregunta, pasa al siguiente.
 */
export async function generarPreguntas({ segmentos, cantidad, tipos, nivel, alAvanzar, alCrear, cancelado }: OpcionesGeneracion) {
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
        const p = await generarPregunta(contexto, foco, tipo, Math.random() < 0.5, intento, nivel)
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
