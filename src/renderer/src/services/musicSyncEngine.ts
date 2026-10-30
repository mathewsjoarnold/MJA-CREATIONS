export type MusicSyncMode = 'spectrum' | 'mood' | 'pulse' | 'cycle' | 'ambient'
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
    this.config = { ...this.config, ...newConfig }
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
          stream.getVideoTracks().forEach((track) => track.stop())
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
          stream.getVideoTracks().forEach((track) => track.stop())
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

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)

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

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.transmitTimerId !== null) {
      clearInterval(this.transmitTimerId)
      this.transmitTimerId = null
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
    // 1. High-speed UI & DSP analysis loop (60 FPS)
    const renderLoop = () => {
      if (!this.isRunning) return
      this.processAudioFrame()
      this.animationFrameId = requestAnimationFrame(renderLoop)
    }
    this.animationFrameId = requestAnimationFrame(renderLoop)

    // 2. WiZ UDP transmission loop (~13 Hz / 75ms)
    // Avoids overwhelming WiZ bulbs while maintaining responsive sync
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
      const rgb = hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v)
      this.onFrameCallback({
        bass: normBass,
        mids: normMid,
        highs: normHigh,
        overallEnergy: normOverall,
        isBeat,
        beatPulse: this.beatPulse,
        currentR: rgb.r,
        currentG: rgb.g,
        currentB: rgb.b,
        currentDimming: this.currentDimming,
        frequencyData: this.freqData
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
    }
  }

  // --- UDP Transmission to WiZ Bulbs ---

  private sendLightUpdate() {
    const rgb = hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v)
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
