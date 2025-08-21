import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import JSZip from 'jszip'
import type { WorkerInMessage, WorkerOutMessage, ExtractionSettings, FileMetadata, ExtractedFrame } from '@/lib/types'

let ffmpeg: FFmpeg | null = null
let ready = false
let basePath = ''
let cancelled = false

;(postMessage as any)({ type: 'ALIVE' } as WorkerOutMessage)

async function initFFmpeg() {
  if (ready && ffmpeg) return

  // Strategy 1: same-origin (prefer)
  const local = async () => {
    const base = (basePath || (self as any).location?.origin + '/ffmpeg').replace(/\/$/, '')
    // HEAD preflight
    for (const f of ['ffmpeg-core.js','ffmpeg-core.wasm']) {
      const r = await fetch(`${base}/${f}`, { method:'HEAD', cache:'no-cache' })
      if (!r.ok) throw new Error(`${f} ${r.status}`)
    }
    const useBlob = !(self as any).crossOriginIsolated
    const coreURL = useBlob ? await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript') : `${base}/ffmpeg-core.js`
    const wasmURL = useBlob ? await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm') : `${base}/ffmpeg-core.wasm`
    return { coreURL, wasmURL, mode: useBlob ? 'blob' : 'http', origin: base }
  }

  // Strategy 2/3: CDN ESM fallbacks (ESM, not UMD!)
  const cdn = async (root: string, tag: 'blob-cdn1'|'blob-cdn2') => {
    const base = `${root}/@ffmpeg/core@0.12.6/dist/esm`
    const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
    const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
    return { coreURL, wasmURL, mode: tag, origin: base }
  }

  const strategies = [
    local,
    () => cdn('https://unpkg.com', 'blob-cdn1'),
    () => cdn('https://cdn.jsdelivr.net/npm', 'blob-cdn2'),
  ]

  let lastError: any
  for (const s of strategies) {
    try {
      const { coreURL, wasmURL, mode, origin } = await s()

      ffmpeg = new FFmpeg()

      // Progress (primary hook)
      ffmpeg.on('progress', ({ progress }) => {
        const pct = Math.max(1, Math.min(99, Math.round((progress || 0) * 100)))
        ;(postMessage as any)({ type: 'PROGRESS', progress: { percent: pct, status: 'processing' } } as WorkerOutMessage)
      })

      // Progress fallback by parsing logs
      ffmpeg.on('log', ({ message }) => {
        if (!message) return
        const m = /frame=\s*(\d+)/.exec(message)
        if (m && !cancelled) {
          const frames = parseInt(m[1], 10)
          ;(postMessage as any)({ type: 'PROGRESS', progress: { frames, status: 'processing' } } as WorkerOutMessage)
        }
      })

      await ffmpeg.load({ coreURL, wasmURL })
      ready = true
      ;(postMessage as any)({ type: 'FFMPEG_READY', initMode: mode, base: origin } as WorkerOutMessage)
      return
    } catch (e) {
      lastError = e
      ffmpeg = null
      ready = false
      continue
    }
  }

  throw new Error(`FFmpeg initialization failed: ${lastError?.message || lastError}`)
}

function buildCmd(inputName: string, settings: ExtractionSettings, outExt: 'png'|'jpg', meta?: FileMetadata): string[] {
  const cmd: string[] = ['-hide_banner','-y']

  const start = Number.isFinite(settings.startTime) ? Math.max(0, settings.startTime as number) : null
  const end   = Number.isFinite(settings.endTime)   ? Math.max(0, settings.endTime as number)   : null
  const dur   = start !== null && end !== null && end > start ? (end - start) : null

  if (start && start > 0) cmd.push('-ss', String(start))
  cmd.push('-i', inputName)
  if (dur && dur > 0) cmd.push('-t', String(dur)) // <- never -t 0

  if (settings.mode === 'every') {
    cmd.push('-vsync','0')
  } else {
    const baseFps = meta?.fps ?? 30
    const fps = settings.mode === 'fps'
      ? Math.max(1, Math.min(240, settings.fps ?? 30))
      : Math.max(1, Math.floor(baseFps / Math.max(1, settings.nth ?? 1)))
    cmd.push('-vf', `fps=${fps}`, '-vsync','0')
  }

  if (settings.scale?.mode === 'custom' && settings.scale.width && settings.scale.height) {
    const i = cmd.indexOf('-vf')
    if (i !== -1) cmd[i+1] = `${cmd[i+1]},scale=${settings.scale.width}:${settings.scale.height}`
    else cmd.push('-vf', `scale=${settings.scale.width}:${settings.scale.height}`)
  }

  if (outExt === 'jpg' && settings.outputFormat?.quality) {
    const q = Math.round((100 - settings.outputFormat.quality) / 3)
    cmd.push('-q:v', String(q))
  }

  if (settings.maxFrames) cmd.push('-frames:v', String(settings.maxFrames))
  cmd.push(`frame_%06d.${outExt}`)
  return cmd
}

async function extractFrames(file: File, settings: ExtractionSettings, metadata?: FileMetadata) {
  if (!ffmpeg || !ready) throw new Error('FFmpeg not ready')

  // Short-circuit on WebP with helpful error
  const tt = (metadata?.trueType || file.type || '').toLowerCase();
  if (tt === 'image/webp') {
    throw new Error('Animated WebP should be processed with ImageDecoder (fast). FFmpeg wasm often fails on ANIM/ANMF.');
  }

  cancelled = false
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const inputName = `input.${ext}`

  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const outExt: 'png'|'jpg' = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png'
  const cmd = buildCmd(inputName, settings, outExt, metadata)

  try {
    await ffmpeg.exec(cmd)
  } catch (e:any) {
    throw new Error(`exec failed: ${e?.message || e}\ncmd: ffmpeg ${cmd.join(' ')}`)
  }

  // Collect outputs
  const entries = await ffmpeg.listDir('/')
  const names = entries.map(e => e.name).filter(n => /^frame_\d{6}\.(png|jpg)$/.test(n)).sort()
  if (!names.length) throw new Error('No frames were extracted. Try FPS mode or a shorter time range.')

  // Package to ZIP (or stream back one-by-one)
  const zip = new JSZip()
  for (let i=0;i<names.length;i++) {
    const n = names[i]
    const data = await ffmpeg.readFile(n)
    const blob = new Blob([data as Uint8Array], { type: outExt === 'jpg' ? 'image/jpeg' : 'image/png' })
    zip.file(n, blob)
    await ffmpeg.deleteFile(n)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const base = file.name.replace(/\.[^.]+$/, '')
  ;(postMessage as any)({ type:'PART_READY', partIndex:1, totalParts:1, startFrame:0, endFrame:names.length-1, filename:`${base}_frames.zip`, zip: zipBlob } as WorkerOutMessage)
  ;(postMessage as any)({ type:'COMPLETE', totalFrames:names.length } as WorkerOutMessage)

  await ffmpeg.deleteFile(inputName)
}

onmessage = async (evt: MessageEvent<WorkerInMessage>) => {
  try {
    const msg = evt.data
    if (msg.type === 'INIT') {
      basePath = (msg.basePath || '').replace(/\/$/, '')
      await initFFmpeg()
      return
    }
    if (msg.type === 'EXTRACT') {
      await initFFmpeg()
      await extractFrames(msg.file, msg.settings, msg.metadata)
      return
    }
    if (msg.type === 'CANCEL') { cancelled = true; (self as any).close() }
  } catch (err:any) {
    ;(postMessage as any)({ type:'ERROR', error: err?.message || String(err) } as WorkerOutMessage)
  }
}