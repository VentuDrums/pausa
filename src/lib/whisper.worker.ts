/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline } from '@huggingface/transformers'

// Whisper "base" multilingüe: ~150 MB, funciona en móviles y portátiles modestos.
const MODELO = 'onnx-community/whisper-base_timestamped'

let transcriptor: any = null

self.onmessage = async (e: MessageEvent) => {
  const { audio, idioma, dispositivo } = e.data as { audio: Float32Array; idioma: string; dispositivo: 'webgpu' | 'wasm' }
  try {
    if (!transcriptor) {
      transcriptor = await pipeline('automatic-speech-recognition', MODELO, {
        device: dispositivo,
        dtype: dispositivo === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p: any) => self.postMessage({ tipo: 'progreso', p }),
      } as any)
    }
    self.postMessage({ tipo: 'estado', texto: 'Escuchando el vídeo y escribiendo lo que se dice' })
    const salida: any = await transcriptor(audio, {
      language: idioma,
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    self.postMessage({ tipo: 'hecho', trozos: salida.chunks ?? [] })
  } catch (err: any) {
    self.postMessage({ tipo: 'error', mensaje: String(err?.message ?? err) })
  }
}
