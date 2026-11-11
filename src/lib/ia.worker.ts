/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AutoProcessor, Qwen3_5ForCausalLM, TextStreamer } from '@huggingface/transformers'

// El modelo de lenguaje vive en este hilo aparte para que la página no se congele mientras escribe.
let procesador: any = null
let modelo: any = null
let cargado: string | null = null

const enviar = (m: unknown) => self.postMessage(m)

async function cargar(idModelo: string, dispositivo: 'webgpu' | 'wasm') {
  if (cargado === idModelo && modelo) return
  if (modelo) {
    await modelo.dispose()
    modelo = null
    cargado = null
  }
  const descargas = new Map<string, { cargado: number; total: number }>()
  const progreso = (p: any) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    descargas.set(p.file, { cargado: p.loaded, total: p.total })
    let c = 0
    let t = 0
    descargas.forEach((d) => { c += d.cargado; t += d.total })
    enviar({ tipo: 'progreso', proporcion: t ? c / t : 0 })
  }
  procesador = await AutoProcessor.from_pretrained(idModelo, { progress_callback: progreso } as any)
  modelo = await Qwen3_5ForCausalLM.from_pretrained(idModelo, {
    // Solo la parte de texto (la de visión no la usamos). q4 funciona también en gráficas sin media precisión,
    // pero la tabla de palabras en q4 usa una operación que el procesador (wasm) no tiene: allí va en fp16 (solo usa operaciones normales).
    dtype: { embed_tokens: dispositivo === 'wasm' ? 'fp16' : 'q4', decoder_model_merged: 'q4' },
    device: dispositivo,
    progress_callback: progreso,
  } as any)
  cargado = idModelo
}

async function completar(texto: string, aleatorio: boolean, maxTokens: number): Promise<string> {
  let plantilla: string = procesador.apply_chat_template([{ role: 'user', content: [{ type: 'text', text: texto }] }], {
    add_generation_prompt: true,
    // Los modelos de 2B y 4B "razonan" en voz alta antes de responder (y en inglés): lo desactivamos.
    enable_thinking: false,
  })
  // Por si la plantilla ignora la opción: dejamos el bloque de razonamiento ya abierto y cerrado, vacío.
  if (!/<\/think>\s*$/.test(plantilla)) plantilla = `${plantilla.replace(/<think>\s*$/, '')}<think>\n\n</think>\n\n`
  const entrada = await procesador(plantilla)
  // Un "latido" por segundo mientras escribe: así la página sabe que sigue vivo aunque sea lento (móviles).
  let ultimo = 0
  const streamer = new TextStreamer(procesador.tokenizer, {
    skip_prompt: true,
    callback_function: () => {},
    token_callback_function: () => {
      const ahora = Date.now()
      if (ahora - ultimo > 1000) { ultimo = ahora; enviar({ tipo: 'latido' }) }
    },
  } as any)
  const salida: any = await modelo.generate({
    ...entrada,
    streamer,
    max_new_tokens: maxTokens,
    repetition_penalty: 1.05,
    ...(aleatorio ? { do_sample: true, temperature: 0.7, top_p: 0.8 } : { do_sample: false }),
  })
  const largo = entrada.input_ids.dims.at(-1)
  return procesador.batch_decode(salida.slice(null, [largo, null]), { skip_special_tokens: true })[0]
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.tipo === 'cargar') {
      await cargar(m.modelo, m.dispositivo)
      enviar({ tipo: 'listo', id: m.id })
    } else if (m.tipo === 'completar') {
      const texto = await completar(m.texto, m.aleatorio, m.maxTokens)
      enviar({ tipo: 'respuesta', id: m.id, texto })
    }
  } catch (err: any) {
    enviar({ tipo: 'error', id: m.id, mensaje: String(err?.message ?? err) })
  }
}
