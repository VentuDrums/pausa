/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClaveModelo } from './ia'

export type Analisis = {
  webgpu: boolean
  movil: boolean
  grafica: string
  /** GB de memoria que declara el navegador (Chrome lo limita a 8 como máximo). */
  memoriaGB: number | null
  nucleos: number
  /** Miles de millones de operaciones por segundo medidas en la tarjeta gráfica. */
  gflops: number | null
  nivel: 'bajo' | 'medio' | 'alto'
  recomendado: ClaveModelo
  motivo: string
}

const N = 1024 // matrices de 1024 × 1024: 2.150 millones de operaciones por multiplicación

// Multiplicación de matrices por bloques: es la operación que más repite un modelo de lenguaje.
const SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
const N: u32 = ${N}u;
const T: u32 = 16u;
var<workgroup> As: array<f32, 256>;
var<workgroup> Bs: array<f32, 256>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  var suma = 0.0;
  for (var t = 0u; t < N / T; t++) {
    As[l.y * T + l.x] = A[g.y * N + t * T + l.x];
    Bs[l.y * T + l.x] = B[(t * T + l.y) * N + g.x];
    workgroupBarrier();
    for (var k = 0u; k < T; k++) { suma += As[l.y * T + k] * Bs[k * T + l.x]; }
    workgroupBarrier();
  }
  C[g.y * N + g.x] = suma;
}`

async function medirGflops(dispositivo: any): Promise<number> {
  const bytes = N * N * 4
  const datos = new Float32Array(N * N).map(() => Math.random())
  const usos = (globalThis as any).GPUBufferUsage
  const crear = (uso: number) => dispositivo.createBuffer({ size: bytes, usage: uso })
  const a = crear(usos.STORAGE | usos.COPY_DST)
  const b = crear(usos.STORAGE | usos.COPY_DST)
  const c = crear(usos.STORAGE)
  dispositivo.queue.writeBuffer(a, 0, datos)
  dispositivo.queue.writeBuffer(b, 0, datos)
  const tuberia = dispositivo.createComputePipeline({
    layout: 'auto',
    compute: { module: dispositivo.createShaderModule({ code: SHADER }), entryPoint: 'main' },
  })
  const grupo = dispositivo.createBindGroup({
    layout: tuberia.getBindGroupLayout(0),
    entries: [a, b, c].map((buffer, binding) => ({ binding, resource: { buffer } })),
  })
  const ejecutar = async (veces: number) => {
    const codificador = dispositivo.createCommandEncoder()
    for (let i = 0; i < veces; i++) {
      const pase = codificador.beginComputePass()
      pase.setPipeline(tuberia)
      pase.setBindGroup(0, grupo)
      pase.dispatchWorkgroups(N / 16, N / 16)
      pase.end()
    }
    const t0 = performance.now()
    dispositivo.queue.submit([codificador.finish()])
    await dispositivo.queue.onSubmittedWorkDone()
    return performance.now() - t0
  }
  try {
    await ejecutar(1) // calentamiento
    let veces = 2
    let ms = await ejecutar(veces)
    // En gráficas rápidas, repetimos más veces para que la medida sea fiable (sin pasar de ~1 s en las lentas)
    while (ms < 150 && veces < 256) {
      veces *= 4
      ms = await ejecutar(veces)
    }
    return (2 * N ** 3 * veces) / (ms / 1000) / 1e9
  } finally {
    a.destroy()
    b.destroy()
    c.destroy()
  }
}

export async function analizarDispositivo(): Promise<Analisis> {
  const nav = navigator as any
  const movil =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  const memoriaGB: number | null = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null
  const nucleos = navigator.hardwareConcurrency || 2

  let grafica = 'No disponible para el navegador'
  let gflops: number | null = null
  let webgpu = false
  try {
    const adaptador = await nav.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    if (adaptador) {
      webgpu = true
      const info = adaptador.info ?? {}
      const fabricante = String(info.vendor || '').replace(/^./, (c: string) => c.toUpperCase())
      grafica =
        [info.description || fabricante, info.architecture ? `(arquitectura ${info.architecture})` : '']
          .filter(Boolean)
          .join(' ') || 'Tarjeta gráfica'
      const dispositivo = await adaptador.requestDevice()
      try {
        gflops = await medirGflops(dispositivo)
      } finally {
        dispositivo.destroy()
      }
    }
  } catch (e) {
    console.warn('No se pudo medir la tarjeta gráfica', e)
  }

  let nivel: Analisis['nivel'] = 'bajo'
  if (gflops !== null) nivel = gflops >= 1500 ? 'alto' : gflops >= 250 ? 'medio' : 'bajo'
  if (memoriaGB !== null && memoriaGB < 4) nivel = 'bajo'
  if (movil && nivel === 'alto') nivel = 'medio'

  let recomendado: ClaveModelo = 'ligero'
  let motivo: string
  if (!webgpu) {
    motivo = 'Este navegador no puede usar la tarjeta gráfica: la IA irá con el procesador, así que conviene el modelo más pequeño.'
  } else if (nivel === 'alto') {
    recomendado = 'calidad'
    motivo = 'Tu tarjeta gráfica es potente: puedes usar el modelo más grande, que redacta mejor las preguntas.'
  } else if (nivel === 'medio') {
    recomendado = 'equilibrado'
    motivo = movil
      ? 'Es un móvil o tablet potente: el modelo equilibrado irá bien, aunque tardará algo más que en un ordenador.'
      : 'Tu tarjeta gráfica tiene potencia suficiente para el modelo equilibrado.'
  } else {
    motivo = 'La tarjeta gráfica es modesta: el modelo ligero es el que funcionará con más fluidez.'
  }

  return { webgpu, movil, grafica, memoriaGB, nucleos, gflops, nivel, recomendado, motivo }
}
