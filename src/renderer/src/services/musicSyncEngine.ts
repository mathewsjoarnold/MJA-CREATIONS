export type MusicSyncMode = 'spectrum' | 'mood' | 'pulse' | 'cycle' | 'ambient' | 'screen'
export type PaletteId = 'cyberpunk' | 'synthwave' | 'ocean' | 'fire' | 'neon' | 'aurora'
export type AudioSourceType = 'loopback' | 'mic'

export interface SyncEngineConfig {
  mode: MusicSyncMode
  palette: PaletteId
  sensitivity: number // 0.5 to 2.5
  minBrightness: number // 10 to 50
  maxBrightness: number // 50 to 100
  smoothing: number // 0.1 (snappy) to 0.85 (smooth)
  beatSensitivity: number // 0.6 to 1.8
  targetIp: string // 'all' or bulb IP
  audioSourceType: AudioSourceType
  deviceId?: string
  screenSourceId?: string
}

export interface VisualizerState {
  bass: number
  mids: number
  highs: number
  overallEnergy: number
  isBeat: boolean
  beatPulse: number
  currentR: number
  currentG: number
  currentB: number
  currentDimming: number
  frequencyData: Uint8Array
  screenColor?: { r: number; g: number; b: number }
  isDarkScreen?: boolean
  isWhiteOrGrey?: boolean
  screenTemp?: number
}

export interface PaletteInfo {
  id: PaletteId
  name: string
  colors: string[] // Hex values
  description: string
}

export const PALETTES: PaletteInfo[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    colors: ['#ff007f', '#00f0ff', '#7b00ff', '#ffea00'],
    description: 'Electric pink, neon cyan & cyber purple'
  },
  {
    id: 'synthwave',
    name: 'Synthwave Sunset',
    colors: ['#ff5e00', '#ff0077', '#7900ff', '#00d4ff'],
    description: 'Warm sunset magenta, orange & violet'
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    colors: ['#0055ff', '#00d4ff', '#00ffa2', '#001a66'],
    description: 'Deep abyss blue, turquoise & seafoam'
  },
  {
    id: 'fire',
    name: 'Fire & Amber',
    colors: ['#ff1a00', '#ff7700', '#ffcc00', '#880000'],
    description: 'Blazing flame red, amber & hot gold'
  },
  {
    id: 'neon',
    name: 'Neon Club',
    colors: ['#39ff14', '#ff0055', '#00ffff', '#bf00ff'],
    description: 'High voltage acid green, club pink & teal'
  },
  {
    id: 'aurora',
    name: 'Aurora Borealis',
    colors: ['#00ff99', '#00e1ff', '#8a2be2', '#ff00cc'],
    description: 'Mystical polar greens, ice cyan & violet'
  }
]

// --- Color Helpers ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const diff = max - min
  let h = 0

  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6
    else if (max === g) h = (b - r) / diff + 2
    else h = (r - g) / diff + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : diff / max
  const v = max
  return { h, s, v }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r1 = 0,
    g1 = 0,
    b1 = 0
  if (h < 60) {
    r1 = c
    g1 = x
    b1 = 0
  } else if (h < 120) {
    r1 = x
    g1 = c
    b1 = 0
  } else if (h < 180) {
    r1 = 0
    g1 = c
    b1 = x
  } else if (h < 240) {
    r1 = 0
    g1 = x
    b1 = c
  } else if (h < 300) {
    r1 = x
    g1 = 0
    b1 = c
  } else {
    r1 = c
    g1 = 0
    b1 = x
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  }
}

function lerpHsv(
  c1: { h: number; s: number; v: number },
  c2: { h: number; s: number; v: number },
  t: number
): { h: number; s: number; v: number } {
  // Shortest arc on circle
  let d = (c2.h - c1.h) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360

  return {
    h: (c1.h + d * t + 360) % 360,
    s: c1.s + (c2.s - c1.s) * t,
    v: c1.v + (c2.v - c1.v) * t
  }
}


class WebWorkerTimer {
  private worker: Worker | null = null

  constructor(private intervalMs: number, private onTick: () => void) {}

  public start() {
    this.stop()
    const script = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data.action === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() {
            self.postMessage('tick');
          }, e.data.interval);
        } else if (e.data.action === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `
    try {
      const blob = new Blob([script], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      this.worker = new Worker(url)
      this.worker.onmessage = (e) => {
        if (e.data === 'tick') {
          this.onTick()
        }
      }
      this.worker.postMessage({ action: 'start', interval: this.intervalMs })
    } catch (e) {
      console.warn('Web Worker timer fallback:', e)
    }
  }

  public stop() {
    if (this.worker) {
      try {
        this.worker.postMessage({ action: 'stop' })
        this.worker.terminate()
      } catch {}
      this.worker = null
    }
  }
}

export class MusicSyncEngine {
  private config: SyncEngineConfig = {
    mode: 'spectrum',
    palette: 'cyberpunk',
    sensitivity: 1.2,
    minBrightness: 15,
    maxBrightness: 100,
    smoothing: 0.35,
    beatSensitivity: 1.1,
    targetIp: '',
    audioSourceType: 'loopback'
  }

  private isRunning: boolean = false
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null

  private animationFrameId: number | null = null
  private transmitTimerId: ReturnType<typeof setInterval> | null = null
  private backgroundDspTimerId: ReturnType<typeof setInterval> | null = null
  private silentOscillator: OscillatorNode | null = null
  private silentGain: GainNode | null = null
  private dummyGain: GainNode | null = null
  private dspWorkerTimer: WebWorkerTimer | null = null
  private transmitWorkerTimer: WebWorkerTimer | null = null

  // DSP state
  private freqData: Uint8Array = new Uint8Array(512)
  private peakEnergy: number = 0.3
  private noiseFloor: number = 0.02
  private prevBassEnergy: number = 0
  private bassEnergyHistory: number[] = []
  private lastBeatTime: number = 0
  private beatPulse: number = 0

  // Palette traversal state
  private moodPhase: number = 0
  private cycleColorIndex: number = 0

  // Current interpolated light state
  private currentHsv = { h: 280, s: 1, v: 0.5 }
  private currentDimming: number = 50

  // Screen Ambilight state & dark/white screen ambient handling
  private screenStream: MediaStream | null = null
  private screenVideo: HTMLVideoElement | null = null
  private screenCanvas: HTMLCanvasElement | null = null
  private screenCtx: CanvasRenderingContext2D | null = null
  private lastScreenRgb: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }
  private lastScreenHsv: { h: number; s: number; v: number } = { h: 0, s: 0, v: 1.0 }
  private isDarkScreen: boolean = false
  private isWhiteOrGreyScreen: boolean = false
  private lastScreenTemp: number = 4800
  private darkBlendAmount: number = 0
  private darkGradientHue: number = 0

  // WiZ packet throttling & deadband
  private lastSent = { r: -1, g: -1, b: -1, dimming: -1 }

  // Callback to feed visualizer UI
  private onFrameCallback: ((state: VisualizerState) => void) | null = null

  constructor(initialConfig?: Partial<SyncEngineConfig>) {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig }
    }
  }

  public updateConfig(newConfig: Partial<SyncEngineConfig>) {
    const prevMode = this.config.mode
    const prevScreenId = this.config.screenSourceId
    this.config = { ...this.config, ...newConfig }

    if (this.isRunning) {
      if (this.config.mode === 'screen') {
        if (prevMode !== 'screen' || (this.config.screenSourceId && this.config.screenSourceId !== prevScreenId)) {
          this.stopScreenCapture()
          this.ensureScreenCapture().catch(console.error)
        }
      } else if (prevMode === 'screen') {
        this.stopScreenCapture()
      }
    }
  }

  public getConfig(): SyncEngineConfig {
    return { ...this.config }
  }

  public setOnFrameCallback(callback: ((state: VisualizerState) => void) | null) {
    this.onFrameCallback = callback
  }

  public getIsRunning(): boolean {
    return this.isRunning
  }

  // --- Audio Device Enumeration ---

  public static async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter((d) => d.kind === 'audioinput')
    } catch {
      return []
    }
  }

  // --- Screen Sources for Ambilight ---
  public static async getScreenSources(): Promise<{ id: string; name: string }[]> {
    if (window.api && window.api.getDesktopSources) {
      try {
        const sources = await window.api.getDesktopSources()
        return sources || []
      } catch {
        return []
      }
    }
    return []
  }

  public async ensureScreenCapture(): Promise<void> {
    if (this.screenStream && this.screenStream.active) return

    try {
      let sourceId = this.config.screenSourceId
      if (!sourceId) {
        const sources = (await window.api?.getDesktopSources?.()) || []
        sourceId = sources[0]?.id
      }

      if (!sourceId) {
        console.warn('No desktop source found for screen capture')
        return
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 320,
            maxWidth: 1280,
            minHeight: 180,
            maxHeight: 720,
            maxFrameRate: 30
          }
        } as unknown as MediaTrackConstraints
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.screenStream = stream

      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.srcObject = stream
      await video.play().catch(() => {})
      this.screenVideo = video

      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      this.screenCanvas = canvas
      this.screenCtx = canvas.getContext('2d', { willReadFrequently: true })
      console.log('Screen Ambilight capture started for source:', sourceId)
    } catch (err) {
      console.error('Failed to initialize screen capture:', err)
    }
  }

  public stopScreenCapture(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop())
      this.screenStream = null
    }
    if (this.screenVideo) {
      this.screenVideo.pause()
      this.screenVideo.srcObject = null
      this.screenVideo = null
    }
    this.screenCanvas = null
    this.screenCtx = null
  }

  private extractScreenColor(): {
    r: number
    g: number
    b: number
    isDark: boolean
    isWhiteOrGrey: boolean
    temp: number
  } {
    if (!this.screenVideo || !this.screenCtx || !this.screenCanvas) {
      return {
        ...this.lastScreenRgb,
        isDark: this.isDarkScreen,
        isWhiteOrGrey: this.isWhiteOrGreyScreen,
        temp: this.lastScreenTemp
      }
    }

    if (this.screenVideo.readyState < 2) {
      return {
        ...this.lastScreenRgb,
        isDark: this.isDarkScreen,
        isWhiteOrGrey: this.isWhiteOrGreyScreen,
        temp: this.lastScreenTemp
      }
    }

    try {
      this.screenCtx.drawImage(this.screenVideo, 0, 0, 32, 32)
      const imgData = this.screenCtx.getImageData(0, 0, 32, 32).data

      let totalLum = 0
      let maxLum = 0

      let neutralCount = 0
      let neutralR = 0
      let neutralG = 0
      let neutralB = 0

      let chromaticCount = 0
      let darkCount = 0

      // 12 broad hue bins (30 deg each) for robust chromatic clustering
      const numBins = 12
      const binWeights = new Float32Array(numBins)
      const binR = new Float32Array(numBins)
      const binG = new Float32Array(numBins)
      const binB = new Float32Array(numBins)

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i]
        const g = imgData[i + 1]
        const b = imgData[i + 2]

        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        totalLum += lum
        if (lum > maxLum) maxLum = lum

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const diff = max - min

        // Dark/black pixels (letterbox or dark scene)
        if (max < 22) {
          darkCount++
          continue
        }

        const sat = max === 0 ? 0 : diff / max

        // Categorize into Neutral (White/Grey) vs Chromatic (Color)
        if (sat < 0.18) {
          neutralCount++
          neutralR += r
          neutralG += g
          neutralB += b
        } else {
          chromaticCount++
          // Balanced perceptual weight for colors
          const weight = (0.35 + 0.65 * sat) * Math.pow(lum / 255, 0.8)

          let hue = 0
          if (diff !== 0) {
            if (max === r) hue = ((g - b) / diff) % 6
            else if (max === g) hue = (b - r) / diff + 2
            else hue = (r - g) / diff + 4
            hue = Math.round(hue * 60)
            if (hue < 0) hue += 360
          }

          const bin = Math.min(numBins - 1, Math.floor(hue / 30))
          binWeights[bin] += weight
          binR[bin] += r * weight
          binG[bin] += g * weight
          binB[bin] += b * weight
        }
      }

      const totalPixels = 1024
      const avgLum = totalLum / totalPixels

      // 1. Dark screen detection:
      // ONLY trigger dark gradient when screen is truly pitch black (credits, black screen, black cutscene)
      const isDark = darkCount > totalPixels * 0.88 || (avgLum < 14 && maxLum < 26)
      this.isDarkScreen = isDark

      let targetR: number
      let targetG: number
      let targetB: number
      let isWhiteOrGrey = false
      let calculatedTemp = 4800

      if (isDark) {
        // Slow Moving Ambient Gradient on Black/Dark screen:
        this.darkGradientHue = (this.darkGradientHue + 0.35) % 360
        this.darkBlendAmount = Math.min(1.0, this.darkBlendAmount + 0.05)

        const gradRgb = hsvToRgb(this.darkGradientHue, 0.72, 0.40)
        targetR = gradRgb.r
        targetG = gradRgb.g
        targetB = gradRgb.b
        this.isWhiteOrGreyScreen = false
      } else if (neutralCount >= chromaticCount) {
        // 2. White / Grey majority screen:
        // When screen is white (webpage, doc, bright sky, white scene) or neutral grey
        isWhiteOrGrey = true
        this.isWhiteOrGreyScreen = true
        this.darkBlendAmount = Math.max(0.0, this.darkBlendAmount - 0.08)

        const rawAvgR = neutralR / Math.max(1, neutralCount)
        const rawAvgG = neutralG / Math.max(1, neutralCount)
        const rawAvgB = neutralB / Math.max(1, neutralCount)

        targetR = Math.round(rawAvgR)
        targetG = Math.round(rawAvgG)
        targetB = Math.round(rawAvgB)

        // Calculate color temperature in Kelvin (2700K Warm White to 6500K Cold White)
        const diffRb = Math.abs(rawAvgR - rawAvgB) < 8 ? 0 : rawAvgR - rawAvgB
        calculatedTemp = Math.max(2700, Math.min(6500, Math.round(4800 - diffRb * 25)))
        this.lastScreenTemp = calculatedTemp
      } else {
        // 3. Chromatic color majority screen:
        isWhiteOrGrey = false
        this.isWhiteOrGreyScreen = false
        this.darkBlendAmount = Math.max(0.0, this.darkBlendAmount - 0.08)

        let bestBin = -1
        let maxWeight = 0
        for (let b = 0; b < numBins; b++) {
          if (binWeights[b] > maxWeight) {
            maxWeight = binWeights[b]
            bestBin = b
          }
        }

        if (bestBin !== -1 && maxWeight > 0.3) {
          targetR = Math.round(binR[bestBin] / binWeights[bestBin])
          targetG = Math.round(binG[bestBin] / binWeights[bestBin])
          targetB = Math.round(binB[bestBin] / binWeights[bestBin])
        } else {
          targetR = this.lastScreenRgb.r
          targetG = this.lastScreenRgb.g
          targetB = this.lastScreenRgb.b
        }
      }

      // Smooth color transitions in RGB space (no circular hue jumping)
      const smooth = isDark ? 0.08 : 0.22
      this.lastScreenRgb = {
        r: Math.round(this.lastScreenRgb.r * (1 - smooth) + targetR * smooth),
        g: Math.round(this.lastScreenRgb.g * (1 - smooth) + targetG * smooth),
        b: Math.round(this.lastScreenRgb.b * (1 - smooth) + targetB * smooth)
      }

      this.lastScreenHsv = rgbToHsv(this.lastScreenRgb.r, this.lastScreenRgb.g, this.lastScreenRgb.b)
      return {
        ...this.lastScreenRgb,
        isDark,
        isWhiteOrGrey,
        temp: calculatedTemp
      }
    } catch {
      return {
        ...this.lastScreenRgb,
        isDark: false,
        isWhiteOrGrey: this.isWhiteOrGreyScreen,
        temp: this.lastScreenTemp
      }
    }
  }

  // --- Start / Stop ---

  public async start(): Promise<boolean> {
    if (this.isRunning) return true

    try {
      let stream: MediaStream

      if (this.config.audioSourceType === 'loopback') {
        // Windows system audio loopback with seamless multi-version fallback
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
          })
          stream.getVideoTracks().forEach((track) => { track.enabled = false })
        } catch (displayMediaErr) {
          console.warn('getDisplayMedia failed, trying desktopCapturer fallback:', displayMediaErr)
          const sources = (await window.api.getDesktopSources?.()) || []
          const sourceId = sources[0]?.id
          const constraints: MediaStreamConstraints = {
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                ...(sourceId ? { chromeMediaSourceId: sourceId } : {})
              }
            } as unknown as MediaTrackConstraints,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                ...(sourceId ? { chromeMediaSourceId: sourceId } : {}),
                minWidth: 1,
                maxWidth: 1,
                minHeight: 1,
                maxHeight: 1
              }
            } as unknown as MediaTrackConstraints
          }
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          stream.getVideoTracks().forEach((track) => { track.enabled = false })
        }
      } else {
        // Microphone or selected audio input device
        const constraints: MediaStreamConstraints = {
          audio: this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : true,
          video: false
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      }

      this.mediaStream = stream

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.5
      this.sourceNode.connect(this.analyser)

      // Connect analyser through zero-gain node to destination:
      // Chromium pauses MediaStream capture when hidden/minimized if the Web Audio graph
      // has no route to destination. Route to destination with gain 0 to keep the capture graph active.
      this.dummyGain = this.audioContext.createGain()
      this.dummyGain.gain.setValueAtTime(0, this.audioContext.currentTime)
      this.analyser.connect(this.dummyGain)
      this.dummyGain.connect(this.audioContext.destination)

      // Silent oscillator keep-alive to destination:
      // Guarantees Chromium keeps the high-priority audio engine ticking in background.
      this.silentOscillator = this.audioContext.createOscillator()
      this.silentGain = this.audioContext.createGain()
      this.silentGain.gain.setValueAtTime(0, this.audioContext.currentTime)
      this.silentOscillator.connect(this.silentGain)
      this.silentGain.connect(this.audioContext.destination)
      this.silentOscillator.start()

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)

      if (this.config.mode === 'screen') {
        await this.ensureScreenCapture()
      }
      this.isRunning = true
      this.startLoops()
      return true
    } catch (err) {
      console.error('Failed to start Music Sync audio capture:', err)
      this.stop()
      throw err
    }
  }

  public stop() {
    this.isRunning = false
    this.stopScreenCapture()

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.transmitTimerId !== null) {
      clearInterval(this.transmitTimerId)
      this.transmitTimerId = null
    }

    if (this.backgroundDspTimerId !== null) {
      clearInterval(this.backgroundDspTimerId)
      this.backgroundDspTimerId = null
    }

    if (this.dspWorkerTimer) {
      this.dspWorkerTimer.stop()
      this.dspWorkerTimer = null
    }

    if (this.transmitWorkerTimer) {
      this.transmitWorkerTimer.stop()
      this.transmitWorkerTimer = null
    }

    if (this.silentOscillator) {
      try {
        this.silentOscillator.stop()
        this.silentOscillator.disconnect()
      } catch {}
      this.silentOscillator = null
    }

    if (this.silentGain) {
      try {
        this.silentGain.disconnect()
      } catch {}
      this.silentGain = null
    }

    if (this.dummyGain) {
      try {
        this.dummyGain.disconnect()
      } catch {}
      this.dummyGain = null
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch {}
      this.sourceNode = null
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect()
      } catch {}
      this.analyser = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }

    this.lastSent = { r: -1, g: -1, b: -1, dimming: -1 }
  }

  // --- Processing Loops ---

  private startLoops() {
    // 1. High-speed UI visualizer animation loop (60 FPS when window is visible)
    const renderLoop = () => {
      if (!this.isRunning) return
      this.animationFrameId = requestAnimationFrame(renderLoop)
    }
    this.animationFrameId = requestAnimationFrame(renderLoop)

    // 2. Web Worker continuous DSP timer (runs on separate OS background thread, completely immune to Chromium minimize/background throttling)
    this.dspWorkerTimer = new WebWorkerTimer(33, () => {
      if (!this.isRunning) return
      if (this.audioContext && this.audioContext.state !== 'running') {
        this.audioContext.resume().catch(() => {})
      }
      this.processAudioFrame()
    })
    this.dspWorkerTimer.start()

    // 3. Web Worker UDP transmission timer (~13 Hz / 75ms)
    this.transmitWorkerTimer = new WebWorkerTimer(75, () => {
      if (!this.isRunning) return
      this.processAudioFrame()
      this.sendLightUpdate()
    })
    this.transmitWorkerTimer.start()

    // 4. Secondary fallback interval timers
    this.backgroundDspTimerId = setInterval(() => {
      if (!this.isRunning) return
      if (this.audioContext && this.audioContext.state !== 'running') {
        this.audioContext.resume().catch(() => {})
      }
      this.processAudioFrame()
    }, 33)

    this.transmitTimerId = setInterval(() => {
      if (!this.isRunning) return
      this.sendLightUpdate()
    }, 75)
  }

  private processAudioFrame() {
    if (!this.analyser) return

    this.analyser.getByteFrequencyData(this.freqData as unknown as Uint8Array<ArrayBuffer>)

    // Frequency bands:
    // sampleRate ~44100, fftSize 1024 => ~43Hz per bin
    // Sub-bass & Bass: bins 1 - 6 (~43Hz to 258Hz)
    // Mids: bins 7 - 58 (~300Hz to 2500Hz)
    // Highs: bins 59 - 300 (~2500Hz to 13000Hz)

    let bassSum = 0
    let bassCount = 0
    for (let i = 1; i <= 6; i++) {
      bassSum += this.freqData[i]
      bassCount++
    }
    const rawBass = bassSum / (bassCount * 255)

    let midSum = 0
    let midCount = 0
    for (let i = 7; i <= 58; i++) {
      midSum += this.freqData[i]
      midCount++
    }
    const rawMid = midSum / (midCount * 255)

    let highSum = 0
    let highCount = 0
    for (let i = 59; i <= 300; i++) {
      highSum += this.freqData[i]
      highCount++
    }
    const rawHigh = highSum / (highCount * 255)

    const rawOverall = rawBass * 0.5 + rawMid * 0.35 + rawHigh * 0.15

    // Dynamic Auto-Gain Control (AGC) & Noise floor
    this.peakEnergy = Math.max(rawOverall, this.peakEnergy * 0.996 + rawOverall * 0.004)
    this.noiseFloor = Math.min(rawOverall, this.noiseFloor * 0.998 + rawOverall * 0.002)
    const dynamicRange = Math.max(0.08, this.peakEnergy - this.noiseFloor)

    // Gain adjusted band energies
    const normOverall = Math.min(
      1,
      Math.max(0, (rawOverall - this.noiseFloor) / dynamicRange) * this.config.sensitivity
    )
    const normBass = Math.min(1, Math.max(0, (rawBass - this.noiseFloor) / dynamicRange) * this.config.sensitivity)
    const normMid = Math.min(1, Math.max(0, (rawMid - this.noiseFloor) / dynamicRange) * this.config.sensitivity)
    const normHigh = Math.min(1, Math.max(0, (rawHigh - this.noiseFloor) / dynamicRange) * this.config.sensitivity)

    // Beat Detection (Spectral Flux on Bass)
    const now = performance.now()
    const bassDelta = Math.max(0, normBass - this.prevBassEnergy)
    this.prevBassEnergy = normBass

    this.bassEnergyHistory.push(normBass)
    if (this.bassEnergyHistory.length > 20) this.bassEnergyHistory.shift()

    const avgBass = this.bassEnergyHistory.reduce((a, b) => a + b, 0) / this.bassEnergyHistory.length
    const beatThreshold = avgBass * (1.15 / this.config.beatSensitivity) + 0.1

    let isBeat = false
    if (bassDelta > 0.08 && normBass > beatThreshold && now - this.lastBeatTime > 190) {
      isBeat = true
      this.lastBeatTime = now
      this.beatPulse = 1.0

      // Trigger cycle mode step on beat
      this.cycleColorIndex++
    } else {
      // Exponential decay of beat pulse
      this.beatPulse = Math.max(0, this.beatPulse * 0.88 - 0.02)
    }

    // Calculate Target Light Color and Brightness based on selected mode
    const target = this.calculateTargetLight(normBass, normMid, normHigh, normOverall, isBeat)

    // Asymmetric Attack / Decay smoothing
    const smoothFactor = Math.min(0.9, Math.max(0.05, this.config.smoothing))
    // Snappier attack on beat / rises
    const effectiveSmooth = target.v > this.currentHsv.v ? smoothFactor * 0.5 : smoothFactor

    this.currentHsv = lerpHsv(this.currentHsv, target, 1 - effectiveSmooth)

    // Calculate dimming percentage within user configured bounds
    const dimRange = this.config.maxBrightness - this.config.minBrightness
    const targetDim = this.config.minBrightness + dimRange * Math.min(1, target.v + this.beatPulse * 0.25)
    this.currentDimming = Math.round(this.currentDimming * smoothFactor + targetDim * (1 - smoothFactor))

    // Deliver visualizer update to UI
    if (this.onFrameCallback) {
      let calRgb: { r: number; g: number; b: number }
      if (this.config.mode === 'screen' && this.isWhiteOrGreyScreen) {
        calRgb = { r: this.lastScreenRgb.r, g: this.lastScreenRgb.g, b: this.lastScreenRgb.b }
      } else {
        const rawRgb = hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v)
        calRgb = MusicSyncEngine.calibrateForLed(rawRgb.r, rawRgb.g, rawRgb.b)
      }

      this.onFrameCallback({
        bass: normBass,
        mids: normMid,
        highs: normHigh,
        overallEnergy: normOverall,
        isBeat,
        beatPulse: this.beatPulse,
        currentR: calRgb.r,
        currentG: calRgb.g,
        currentB: calRgb.b,
        currentDimming: this.currentDimming,
        frequencyData: this.freqData,
        screenColor: this.config.mode === 'screen' ? calRgb : undefined,
        isDarkScreen: this.isDarkScreen,
        isWhiteOrGrey: this.isWhiteOrGreyScreen,
        screenTemp: this.lastScreenTemp
      })
    }
  }

  private calculateTargetLight(
    bass: number,
    mid: number,
    high: number,
    energy: number,
    _isBeat: boolean
  ): { h: number; s: number; v: number } {
    const palette = PALETTES.find((p) => p.id === this.config.palette) || PALETTES[0]
    const paletteHsvs = palette.colors.map((hex) => {
      const rgb = hexToRgb(hex)
      return rgbToHsv(rgb.r, rgb.g, rgb.b)
    })

    switch (this.config.mode) {
      case 'spectrum': {
        // Frequency Spectrum Flow:
        // Bass = Red (0 deg) to Deep Orange (30 deg)
        // Mid = Green (120 deg) to Amber (60 deg)
        // High = Violet (280 deg) to Electric Cyan (180 deg)
        const total = bass * 1.5 + mid * 1.0 + high * 0.8 + 0.001
        const wBass = (bass * 1.5) / total
        const wMid = (mid * 1.0) / total
        const wHigh = (high * 0.8) / total

        // Vector sum on color wheel
        const rad0 = 0 * (Math.PI / 180)
        const rad1 = 120 * (Math.PI / 180)
        const rad2 = 250 * (Math.PI / 180)

        const x = wBass * Math.cos(rad0) + wMid * Math.cos(rad1) + wHigh * Math.cos(rad2)
        const y = wBass * Math.sin(rad0) + wMid * Math.sin(rad1) + wHigh * Math.sin(rad2)

        let hue = Math.atan2(y, x) * (180 / Math.PI)
        if (hue < 0) hue += 360

        const saturation = 0.88 + high * 0.12
        const value = Math.max(0.1, energy * 0.85 + bass * 0.2)
        return { h: hue, s: saturation, v: value }
      }

      case 'mood': {
        // Harmonic Mood Flow:
        // Gently advance phase along palette colors driven by music energy & spectral centroid
        const speed = 0.004 + energy * 0.02
        this.moodPhase = (this.moodPhase + speed) % paletteHsvs.length

        const idx1 = Math.floor(this.moodPhase)
        const idx2 = (idx1 + 1) % paletteHsvs.length
        const frac = this.moodPhase - idx1

        const baseColor = lerpHsv(paletteHsvs[idx1], paletteHsvs[idx2], frac)
        return {
          h: baseColor.h,
          s: baseColor.s,
          v: Math.max(0.12, energy * 0.9 + this.beatPulse * 0.2)
        }
      }

      case 'pulse': {
        // Beat & Energy Pulse:
        // Anchored to chosen primary palette color with punchy brightness & saturation
        const primaryColor = paletteHsvs[0]
        const accentColor = paletteHsvs[1 % paletteHsvs.length]

        const color = lerpHsv(primaryColor, accentColor, this.beatPulse * 0.6)
        return {
          h: color.h,
          s: Math.min(1, primaryColor.s + this.beatPulse * 0.2),
          v: Math.max(0.08, energy * 0.6 + this.beatPulse * 0.5)
        }
      }

      case 'cycle': {
        // Color Cycle on Beat:
        // Moves sequentially through palette colors on drum kicks
        const curr = paletteHsvs[this.cycleColorIndex % paletteHsvs.length]
        return {
          h: curr.h,
          s: curr.s,
          v: Math.max(0.1, energy * 0.8 + this.beatPulse * 0.3)
        }
      }

      case 'ambient': {
        // Ambient Flow:
        // Silky, relaxed breathing light with gentle hue drift
        const speed = 0.002 + energy * 0.005
        this.moodPhase = (this.moodPhase + speed) % paletteHsvs.length

        const idx1 = Math.floor(this.moodPhase)
        const idx2 = (idx1 + 1) % paletteHsvs.length
        const frac = this.moodPhase - idx1

        const ambientHsv = lerpHsv(paletteHsvs[idx1], paletteHsvs[idx2], frac)
        return {
          h: ambientHsv.h,
          s: Math.max(0.5, ambientHsv.s * 0.85),
          v: Math.max(0.15, energy * 0.7)
        }
      }

      case 'screen': {
        const screenRes = this.extractScreenColor()
        const hue = this.lastScreenHsv.h
        let saturation: number
        let value: number

        if (screenRes.isDark) {
          saturation = 0.72
          value = Math.max(0.18, 0.28 + energy * 0.15)
        } else if (screenRes.isWhiteOrGrey) {
          // When screen is white or grey: true zero/low saturation (eliminates pink & green tint!)
          saturation = Math.min(0.03, this.lastScreenHsv.s)
          // Calibrate white brightness dynamically using sound/music energy (same as other modes):
          value = Math.max(0.12, energy * 0.85 + this.beatPulse * 0.35)
        } else {
          // Natural color saturation:
          saturation = Math.min(1.0, this.lastScreenHsv.s * 1.1)
          value = Math.max(0.15, energy * 0.85 + this.beatPulse * 0.35)
        }

        return {
          h: hue,
          s: saturation,
          v: value
        }
      }
    }
  }

  // --- Smart LED Hardware Calibration ---
  public static calibrateForLed(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const rawR = Math.max(0, Math.min(255, Math.round(r)))
    const rawG = Math.max(0, Math.min(255, Math.round(g)))
    const rawB = Math.max(0, Math.min(255, Math.round(b)))

    const hsv = rgbToHsv(rawR, rawG, rawB)

    // For neutral / white / grey tones (low saturation):
    // Do NOT attenuate green, which prevents false pink / magenta / violet shifts!
    if (hsv.s < 0.18) {
      return { r: rawR, g: rawG, b: rawB }
    }

    const rN = rawR / 255.0
    const gN = rawG / 255.0
    const bN = rawB / 255.0

    let rC = rN
    let gC = gN
    let bC = bN

    // Only attenuate Green in the warm yellow/amber/chartreuse zone (Hue 20 to 85 deg)
    // where the Green LED diode physically overpowers Red to look lime-green.
    if (hsv.h >= 20 && hsv.h <= 85) {
      const dist = Math.abs(hsv.h - 55) / 35.0 // 0 at pure yellow (55 deg), 1 at edges
      const gFactor = 0.70 + 0.25 * dist // 0.70 at yellow, 0.95 at edges
      gC = gN * gFactor
    }

    const maxC = Math.max(rC, gC, bC)
    const maxN = Math.max(rN, gN, bN)

    if (maxC > 0 && maxN > 0) {
      const scale = maxN / maxC
      return {
        r: Math.min(255, Math.max(0, Math.round(rC * scale * 255))),
        g: Math.min(255, Math.max(0, Math.round(gC * scale * 255))),
        b: Math.min(255, Math.max(0, Math.round(bC * scale * 255)))
      }
    }
    return { r: 0, g: 0, b: 0 }
  }

  // --- UDP Transmission to WiZ Bulbs ---

  private sendLightUpdate() {
    // Ensure fresh DSP frame calculation prior to sending
    this.processAudioFrame()

    if (this.config.mode === 'screen' && this.isWhiteOrGreyScreen) {
      // Send dedicated WHITE LED command to WiZ bulb:
      // temp (2700K - 6500K) activates high-CRI dual-white LEDs with ZERO green distortion!
      const temp = this.lastScreenTemp || 4800
      const dimming = this.currentDimming

      // Dead-band check for white mode
      const lastTemp = (this.lastSent as any).temp ?? 0
      if (Math.abs(temp - lastTemp) < 50 && Math.abs(dimming - this.lastSent.dimming) < 3) {
        return
      }

      this.lastSent = { r: 255, g: 255, b: 255, dimming }
      ;(this.lastSent as any).temp = temp

      if (window.api && window.api.syncBulbColor) {
        window.api.syncBulbColor({
          r: 255,
          g: 255,
          b: 255,
          temp,
          dimming,
          ip: this.config.targetIp || undefined
        })
      }
      return
    }

    // Normal color / dark ambient gradient mode:
    ;(this.lastSent as any).temp = 0
    const rawRgb = hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v)
    const rgb = MusicSyncEngine.calibrateForLed(rawRgb.r, rawRgb.g, rawRgb.b)
    const dimming = this.currentDimming

    // Dead-band check: skip sending if change is negligible
    const deltaR = Math.abs(rgb.r - this.lastSent.r)
    const deltaG = Math.abs(rgb.g - this.lastSent.g)
    const deltaB = Math.abs(rgb.b - this.lastSent.b)
    const deltaDim = Math.abs(dimming - this.lastSent.dimming)

    if (deltaR < 4 && deltaG < 4 && deltaB < 4 && deltaDim < 3) {
      return // skip redundant network packet
    }

    this.lastSent = { r: rgb.r, g: rgb.g, b: rgb.b, dimming }

    // Dispatch via Electron IPC to main process UDP socket
    if (window.api && window.api.syncBulbColor) {
      window.api.syncBulbColor({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        dimming,
        ip: this.config.targetIp || undefined
      })
    }
  }
}

// Singleton instance
export const musicSyncEngine = new MusicSyncEngine()

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (musicSyncEngine.getIsRunning()) {
      const ctx = (musicSyncEngine as any).audioContext as AudioContext | null
      if (ctx && ctx.state !== 'running') {
        ctx.resume().catch(() => {})
      }
    }
  })
}
