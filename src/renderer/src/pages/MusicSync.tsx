import Card from '@renderer/components/ui/Card'
import { useBulbStore } from '@renderer/context/BulbStore'
import {
  AudioSourceType,
  MusicSyncEngine,
  MusicSyncMode,
  musicSyncEngine,
  PaletteId,
  PALETTES,
  VisualizerState
} from '@renderer/services/musicSyncEngine'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuActivity,
  LuAudioLines,
  LuDisc,
  LuMic,
  LuMonitor,
  LuMusic,
  LuPause,
  LuPlay,
  LuSlidersHorizontal,
  LuSparkles,
  LuZap
} from 'react-icons/lu'

export default function MusicSync() {
  const { t } = useTranslation()
  const { activeBulb, bulbs } = useBulbStore()

  const [isActive, setIsActive] = useState<boolean>(musicSyncEngine.getIsRunning())
  const [mode, setMode] = useState<MusicSyncMode>('spectrum')
  const [palette, setPalette] = useState<PaletteId>('cyberpunk')
  const [audioSource, setAudioSource] = useState<AudioSourceType>('loopback')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [targetBulb, setTargetBulb] = useState<string>('all')
  const [screenSources, setScreenSources] = useState<{ id: string; name: string }[]>([])
  const [selectedScreenId, setSelectedScreenId] = useState<string>('')
  const [liveScreenColor, setLiveScreenColor] = useState<{ r: number; g: number; b: number } | null>(null)
  const [isDarkScreen, setIsDarkScreen] = useState<boolean>(false)
  const [isWhiteOrGrey, setIsWhiteOrGrey] = useState<boolean>(false)
  const [screenTemp, setScreenTemp] = useState<number>(4800)

  const [sensitivity, setSensitivity] = useState<number>(1.2)
  const [minBrightness, setMinBrightness] = useState<number>(15)
  const [maxBrightness, setMaxBrightness] = useState<number>(100)
  const [smoothing, setSmoothing] = useState<number>(0.35)
  const [beatSensitivity, setBeatSensitivity] = useState<number>(1.1)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vizDataRef = useRef<VisualizerState | null>(null)

  // Load audio input devices and screen sources
  useEffect(() => {
    MusicSyncEngine.getAudioInputDevices().then((devices) => {
      setAudioDevices(devices)
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId)
      }
    })
    MusicSyncEngine.getScreenSources().then((sources) => {
      setScreenSources(sources)
      if (sources.length > 0 && !selectedScreenId) {
        setSelectedScreenId(sources[0].id)
      }
    })
  }, [])

  // Sync engine config when settings change
  useEffect(() => {
    musicSyncEngine.updateConfig({
      mode,
      palette,
      sensitivity,
      minBrightness,
      maxBrightness,
      smoothing,
      beatSensitivity,
      targetIp: targetBulb,
      audioSourceType: audioSource,
      deviceId: selectedDeviceId,
      screenSourceId: selectedScreenId
    })
  }, [
    mode,
    palette,
    sensitivity,
    minBrightness,
    maxBrightness,
    smoothing,
    beatSensitivity,
    targetBulb,
    audioSource,
    selectedDeviceId,
    selectedScreenId
  ])

  // Canvas visualizer loop with exact aspect-ratio and crisp high-DPI scaling
  useEffect(() => {
    let lastUiColorTime = 0
    musicSyncEngine.setOnFrameCallback((state) => {
      vizDataRef.current = state
      const now = performance.now()
      if (state.screenColor && now - lastUiColorTime > 120) {
        lastUiColorTime = now
        setLiveScreenColor(state.screenColor)
        if (state.isDarkScreen !== undefined) {
          setIsDarkScreen(state.isDarkScreen)
        }
        if (state.isWhiteOrGrey !== undefined) {
          setIsWhiteOrGrey(state.isWhiteOrGrey)
        }
        if (state.screenTemp !== undefined) {
          setScreenTemp(state.screenTemp)
        }
      }
    })

    let animationId: number
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    const updateCanvasSize = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const targetWidth = Math.floor(rect.width * dpr)
      const targetHeight = Math.floor(rect.height * dpr)

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }
    }

    const render = () => {
      if (canvas && ctx) {
        updateCanvasSize()
        const dpr = window.devicePixelRatio || 1
        const width = canvas.width / dpr
        const height = canvas.height / dpr

        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, width, height)

        const viz = vizDataRef.current
        const r = viz?.currentR ?? 130
        const g = viz?.currentG ?? 45
        const b = viz?.currentB ?? 220
        const dim = viz?.currentDimming ?? 30
        const isBeat = viz?.isBeat ?? false

        // Background dark gradient with subtle glow
        const bgGrad = ctx.createRadialGradient(
          width / 2,
          height / 2,
          20,
          width / 2,
          height / 2,
          Math.max(width, height) / 1.4
        )
        const glowAlpha = isActive ? Math.min(0.35, 0.05 + (dim / 100) * 0.3) : 0.04
        bgGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`)
        bgGrad.addColorStop(1, 'rgba(15, 17, 23, 0.95)')
        ctx.fillStyle = bgGrad
        ctx.fillRect(0, 0, width, height)

        // Draw frequency bars across the base
        if (viz && viz.frequencyData && isActive) {
          const bufferLength = viz.frequencyData.length
          const barCount = 48
          const barWidth = Math.max(2, (width - barCount * 3) / barCount)
          const totalBarsWidth = barCount * (barWidth + 3)
          const startX = (width - totalBarsWidth) / 2
          const step = Math.floor(bufferLength / barCount)

          for (let i = 0; i < barCount; i++) {
            const val = viz.frequencyData[i * step] / 255
            const barHeight = Math.max(4, val * (height * 0.48))
            const x = startX + i * (barWidth + 3)
            const y = height - barHeight - 8

            // Gradient per bar based on frequency
            const barGrad = ctx.createLinearGradient(0, height, 0, y)
            if (i < barCount * 0.25) {
              barGrad.addColorStop(0, 'rgba(255, 60, 60, 0.4)')
              barGrad.addColorStop(1, 'rgba(255, 90, 50, 0.95)')
            } else if (i < barCount * 0.65) {
              barGrad.addColorStop(0, 'rgba(255, 180, 0, 0.4)')
              barGrad.addColorStop(1, 'rgba(0, 240, 160, 0.95)')
            } else {
              barGrad.addColorStop(0, 'rgba(0, 180, 255, 0.4)')
              barGrad.addColorStop(1, 'rgba(180, 70, 255, 0.95)')
            }

            ctx.fillStyle = barGrad
            ctx.beginPath()
            ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0])
            ctx.fill()
          }
        }

        // Center Live Light Orb (Guaranteed 1:1 Perfect Circle)
        const centerX = width / 2
        const centerY = height * 0.42
        const baseRadius = 38 + (dim / 100) * 18
        const pulseRadius = isBeat ? baseRadius + 10 : baseRadius

        // Outer ambient glow
        const orbGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          5,
          centerX,
          centerY,
          pulseRadius * 2.2
        )
        orbGrad.addColorStop(0, `rgb(${r}, ${g}, ${b})`)
        orbGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${isActive ? 0.6 : 0.2})`)
        orbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

        ctx.fillStyle = orbGrad
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius * 2.2, 0, Math.PI * 2)
        ctx.fill()

        // Inner solid core
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2)
        ctx.fill()

        // Bulb indicator ring
        ctx.strokeStyle = isBeat ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = isBeat ? 3.5 : 2
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius + 2.5, 0, Math.PI * 2)
        ctx.stroke()

        // Center text inside orb
        ctx.fillStyle = '#ffffff'
        ctx.font = '600 12px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const label = isActive ? `${dim}% Dim` : 'Ready'
        ctx.fillText(label, centerX, centerY)

        if (isBeat && isActive) {
          ctx.fillStyle = '#ff2a6d'
          ctx.font = 'bold 11px Inter, sans-serif'
          ctx.fillText('⚡ BEAT', centerX, centerY - pulseRadius - 12)
        }

        ctx.restore()
      }

      animationId = requestAnimationFrame(render)
    }

    animationId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [isActive])

  const handleToggleSync = async () => {
    if (isActive) {
      musicSyncEngine.stop()
      setIsActive(false)
      setStatusMessage(null)
    } else {
      setStatusMessage(t('musicSync.starting', 'Starting audio capture...'))
      try {
        await musicSyncEngine.start()
        setIsActive(true)
        setStatusMessage(null)
      } catch (err) {
        console.error('Audio capture failed:', err)
        setIsActive(false)
        setStatusMessage(
          t(
            'musicSync.captureError',
            'Could not capture audio. Please ensure audio is playing or try microphone input.'
          )
        )
      }
    }
  }

  const modes: { id: MusicSyncMode; title: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'spectrum',
      title: 'Spectrum Flow',
      desc: 'Dynamic color split across bass, mids, and treble frequencies.',
      icon: <LuAudioLines size={22} className="text-pink-400" />
    },
    {
      id: 'mood',
      title: 'Harmonic Mood',
      desc: 'Smoothly drifts through colors based on musical energy.',
      icon: <LuSparkles size={22} className="text-yellow-400" />
    },
    {
      id: 'pulse',
      title: 'Beat Pulse',
      desc: 'Punchy brightness flashes matching kick drums and bass hits.',
      icon: <LuZap size={22} className="text-orange-400" />
    },
    {
      id: 'cycle',
      title: 'Beat Cycle',
      desc: 'Steps through harmonic colors on every rhythmic beat.',
      icon: <LuDisc size={22} className="text-cyan-400" />
    },
    {
      id: 'ambient',
      title: 'Ambient Glow',
      desc: 'Silky, relaxed breathing light with zero harsh strobing.',
      icon: <LuActivity size={22} className="text-emerald-400" />
    },
    {
      id: 'screen',
      title: 'Screen Ambilight',
      desc: 'Syncs bulb color to dominant screen pixels, with audio-driven brightness.',
      icon: <LuMonitor size={22} className="text-cyan-400" />
    }
  ]

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto flex flex-col gap-6 pb-14">
      {/* Header Row */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 shadow-sm">
              <LuMusic size={24} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Music Sync</h1>
          </div>
          <p className="text-neutral-400 text-sm mt-1">
            Real-time, intelligent sound-to-light synchronization for your WiZ bulbs
          </p>
        </div>

        {/* Big Start / Stop Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleSync}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 hover:scale-[1.02] active:scale-95 animate-pulse'
                : 'bg-primary hover:bg-primary-600 text-white shadow-primary/30 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isActive ? <LuPause size={18} /> : <LuPlay size={18} />}
            <span>{isActive ? 'Stop Music Sync' : 'Start Music Sync'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl text-sm">
          {statusMessage}
        </div>
      )}

      {/* Live Visualizer Stage (1:1 Aspect Ratio Canvas) */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 shadow-lg">
        {/* Top Floating Badge Bar */}
        <div className="absolute top-3 left-4 right-4 flex justify-between items-center z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-neutral-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isActive ? 'bg-emerald-400 animate-ping' : 'bg-neutral-500'
              }`}
            />
            <span className="font-medium text-neutral-200">
              {isActive ? 'Audio Reactivity Active' : 'Standby Mode'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isActive && (
              <span className="text-[11px] font-mono font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full backdrop-blur-md">
                13 Hz UDP Stream
              </span>
            )}
          </div>
        </div>

        <canvas ref={canvasRef} className="w-full h-48 block bg-neutral-950" />
      </div>

      {/* Audio Source & Target Bulb Controls (Balanced 2-Column Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Audio Source Card */}
        <Card variant="secondary" padding="medium" className="flex flex-col justify-between gap-3 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold text-sm">
            <LuSlidersHorizontal size={18} className="text-blue-400" />
            <span>Audio Source</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (isActive) musicSyncEngine.stop()
                setIsActive(false)
                setAudioSource('loopback')
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                audioSource === 'loopback'
                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                  : 'bg-neutral-900/80 border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <LuMonitor size={15} />
              <span className="truncate">PC Loopback</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isActive) musicSyncEngine.stop()
                setIsActive(false)
                setAudioSource('mic')
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                audioSource === 'mic'
                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                  : 'bg-neutral-900/80 border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <LuMic size={15} />
              <span className="truncate">Microphone</span>
            </button>
          </div>

          {audioSource === 'mic' && audioDevices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-white text-xs rounded-lg px-3 py-2 mt-1 focus:outline-none focus:border-blue-500"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}

          <p className="text-[11px] text-neutral-400">
            Captures system audio loopback without any virtual cables or latency.
          </p>
        </Card>

        {/* Target Bulb Card */}
        <Card variant="secondary" padding="medium" className="flex flex-col justify-between gap-3 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold text-sm">
            <LuSparkles size={18} className="text-yellow-400" />
            <span>Target Light Bulb(s)</span>
          </div>

          <div>
            <select
              value={targetBulb}
              onChange={(e) => setTargetBulb(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {activeBulb && (
                <option value={activeBulb.ip}>
                  Active: {activeBulb.name} ({activeBulb.ip})
                </option>
              )}
              {bulbs.length > 1 && <option value="all">⚡ All Bulbs ({bulbs.length} bulbs)</option>}
              {bulbs.map((b) => (
                <option key={b.ip} value={b.ip}>
                  {b.name} ({b.ip})
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-neutral-400">
            WiZ UDP streaming sends fire-and-forget packets (~13 Hz) to prevent network lag.
          </p>
        </Card>
      </div>

      {/* Screen Ambilight Source Card (shown when mode === 'screen') */}
      {mode === 'screen' && (
        <Card variant="secondary" padding="medium" className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 shadow-lg shadow-cyan-950/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
              <LuMonitor size={18} className="text-cyan-400" />
              <span>Screen Ambilight + Audio Settings</span>
            </div>
            {liveScreenColor && (
              <div className="flex items-center gap-2 text-xs text-neutral-200 bg-neutral-900/90 px-3 py-1 rounded-lg border border-cyan-500/30">
                <span className="text-neutral-400">
                  {isDarkScreen
                    ? 'Ambient Moving Gradient (Dark Scene):'
                    : isWhiteOrGrey
                      ? 'Daylight White:'
                      : 'Live Screen Color:'}
                </span>
                <span
                  className={`w-4 h-4 rounded-full border border-white/40 shadow-sm inline-block transition-colors duration-300 ${
                    isDarkScreen ? 'animate-pulse' : ''
                  }`}
                  style={{
                    backgroundColor: isWhiteOrGrey
                      ? '#ffffff'
                      : `rgb(${liveScreenColor.r}, ${liveScreenColor.g}, ${liveScreenColor.b})`
                  }}
                />
                <span className="font-mono text-[11px] text-cyan-300 font-bold">
                  {isWhiteOrGrey
                    ? `${screenTemp}K White`
                    : `rgb(${liveScreenColor.r}, ${liveScreenColor.g}, ${liveScreenColor.b})`}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-neutral-400 mb-1 block font-medium">Display / Screen to Mirror</label>
              <select
                value={selectedScreenId}
                onChange={(e) => setSelectedScreenId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {screenSources.length === 0 && <option value="">Primary Display</option>}
                {screenSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    🖥️ {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-[11px] text-neutral-400">
            Continuously samples dominant pixel hues from the chosen screen to paint the bulb color, while your audio loopback/mic drives dynamic brightness dimming and beat pulses.
          </p>
        </Card>
      )}

      {/* Sync Mode Selector (Uniform, Responsive Grid) */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-neutral-200">Synchronization Mode</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {modes.map((m) => {
            const isSelected = mode === m.id
            return (
              <div
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border text-left flex flex-col justify-between min-h-[8.5rem] ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 ring-1 ring-blue-500/50 shadow-md shadow-blue-500/10 scale-[1.02]'
                    : 'bg-secondary/70 border-white/5 hover:border-white/15 hover:bg-secondary/90 hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500/20' : 'bg-white/5'}`}>
                    {m.icon}
                  </div>
                  {isSelected && (
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white tracking-wide">{m.title}</h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-snug line-clamp-2">{m.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Color Palette Selector (for Mood, Pulse, Cycle & Ambient) */}
      {mode !== 'spectrum' && mode !== 'screen' && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-neutral-200">Color Palette</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {PALETTES.map((p) => {
              const isSelected = palette === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border flex flex-col gap-2 items-center ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500 ring-1 ring-blue-500/50 shadow-md'
                      : 'bg-secondary/70 border-white/5 hover:border-white/15 hover:bg-secondary/90'
                  }`}
                >
                  <div className="flex items-center gap-1.5 justify-center py-1">
                    {p.colors.map((c, i) => (
                      <span
                        key={i}
                        className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-center text-neutral-200">
                    {p.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Deep Tuning Sliders (Spacious 2x2 Grid - Never Squeezed) */}
      <Card variant="secondary" padding="large" className="flex flex-col gap-5 rounded-2xl border border-white/5">
        <h2 className="text-base font-semibold text-neutral-200 flex items-center gap-2">
          <LuSlidersHorizontal size={20} className="text-blue-400" />
          <span>Intelligent DSP Tuning</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {/* Audio Sensitivity */}
          <div className="flex flex-col gap-2.5 bg-neutral-900/60 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-200 text-sm">Audio Sensitivity</span>
              <span className="text-blue-400 font-mono font-bold bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                {Math.round(sensitivity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <p className="text-xs text-neutral-400 leading-normal">
              Amplifies reactivity for quiet songs or lower PC master volumes.
            </p>
          </div>

          {/* Color Smoothing */}
          <div className="flex flex-col gap-2.5 bg-neutral-900/60 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-200 text-sm">Color Smoothing</span>
              <span className="text-blue-400 font-mono font-bold bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                {smoothing < 0.25 ? 'Snappy' : smoothing < 0.5 ? 'Balanced' : 'Silky'}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <p className="text-xs text-neutral-400 leading-normal">
              Interpolation speed between color changes (higher = smoother transitions).
            </p>
          </div>

          {/* Dynamic Brightness Range */}
          <div className="flex flex-col gap-2.5 bg-neutral-900/60 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-200 text-sm">Brightness Range</span>
              <span className="text-blue-400 font-mono font-bold bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                {minBrightness}% – {maxBrightness}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 my-0.5">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                  <span>Min Floor</span>
                  <span>{minBrightness}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={minBrightness}
                  onChange={(e) => setMinBrightness(parseInt(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
                  title="Minimum Brightness"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                  <span>Max Ceiling</span>
                  <span>{maxBrightness}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={maxBrightness}
                  onChange={(e) => setMaxBrightness(parseInt(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
                  title="Maximum Brightness"
                />
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-normal">
              Keeps light alive between beats (Floor) and limits maximum intensity (Ceiling).
            </p>
          </div>

          {/* Beat Kick Sensitivity */}
          <div className="flex flex-col gap-2.5 bg-neutral-900/60 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-200 text-sm">Beat Detection Sensitivity</span>
              <span className="text-blue-400 font-mono font-bold bg-blue-500/15 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                {Math.round(beatSensitivity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={beatSensitivity}
              onChange={(e) => setBeatSensitivity(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
            />
            <p className="text-xs text-neutral-400 leading-normal">
              Spectral flux threshold for triggering drum hits and rhythmic flashes.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
