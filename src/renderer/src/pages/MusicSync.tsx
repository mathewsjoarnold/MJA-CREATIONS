import Button from '@renderer/components/ui/Button'
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
  const [targetBulb, setTargetBulb] = useState<string>(activeBulb?.ip || '')

  const [sensitivity, setSensitivity] = useState<number>(1.2)
  const [minBrightness, setMinBrightness] = useState<number>(15)
  const [maxBrightness, setMaxBrightness] = useState<number>(100)
  const [smoothing, setSmoothing] = useState<number>(0.35)
  const [beatSensitivity, setBeatSensitivity] = useState<number>(1.1)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vizDataRef = useRef<VisualizerState | null>(null)

  // Load audio input devices
  useEffect(() => {
    MusicSyncEngine.getAudioInputDevices().then((devices) => {
      setAudioDevices(devices)
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId)
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
      deviceId: selectedDeviceId
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
    selectedDeviceId
  ])

  // Canvas visualizer loop
  useEffect(() => {
    musicSyncEngine.setOnFrameCallback((state) => {
      vizDataRef.current = state
    })

    let animationId: number
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    const render = () => {
      if (canvas && ctx) {
        const width = canvas.width
        const height = canvas.height
        ctx.clearRect(0, 0, width, height)

        const viz = vizDataRef.current
        const r = viz?.currentR ?? 120
        const g = viz?.currentG ?? 40
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
          width / 1.5
        )
        const glowAlpha = isActive ? Math.min(0.35, 0.05 + (dim / 100) * 0.3) : 0.04
        bgGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`)
        bgGrad.addColorStop(1, 'rgba(15, 17, 23, 0.95)')
        ctx.fillStyle = bgGrad
        ctx.fillRect(0, 0, width, height)

        // Draw frequency bars
        if (viz && viz.frequencyData && isActive) {
          const bufferLength = viz.frequencyData.length
          const barCount = 48
          const barWidth = (width - barCount * 3) / barCount
          const step = Math.floor(bufferLength / barCount)

          for (let i = 0; i < barCount; i++) {
            const val = viz.frequencyData[i * step] / 255
            const barHeight = Math.max(4, val * (height * 0.55))
            const x = i * (barWidth + 3) + 4
            const y = height - barHeight - 10

            // Gradient per bar based on frequency
            const barGrad = ctx.createLinearGradient(0, height, 0, y)
            if (i < barCount * 0.25) {
              // Bass: Warm / Red-Orange
              barGrad.addColorStop(0, 'rgba(255, 60, 60, 0.4)')
              barGrad.addColorStop(1, 'rgba(255, 90, 50, 0.95)')
            } else if (i < barCount * 0.65) {
              // Mids: Yellow-Green
              barGrad.addColorStop(0, 'rgba(255, 180, 0, 0.4)')
              barGrad.addColorStop(1, 'rgba(0, 240, 160, 0.95)')
            } else {
              // Treble: Cyan-Purple
              barGrad.addColorStop(0, 'rgba(0, 180, 255, 0.4)')
              barGrad.addColorStop(1, 'rgba(180, 70, 255, 0.95)')
            }

            ctx.fillStyle = barGrad
            ctx.beginPath()
            ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0])
            ctx.fill()
          }
        }

        // Center Live Light Orb
        const centerX = width / 2
        const centerY = height * 0.42
        const baseRadius = 42 + (dim / 100) * 22
        const pulseRadius = isBeat ? baseRadius + 12 : baseRadius

        // Outer glow
        const orbGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          5,
          centerX,
          centerY,
          pulseRadius * 2
        )
        orbGrad.addColorStop(0, `rgb(${r}, ${g}, ${b})`)
        orbGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${isActive ? 0.6 : 0.2})`)
        orbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

        ctx.fillStyle = orbGrad
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius * 2, 0, Math.PI * 2)
        ctx.fill()

        // Inner solid core
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2)
        ctx.fill()

        // Bulb indicator ring
        ctx.strokeStyle = isBeat ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'
        ctx.lineWidth = isBeat ? 4 : 2
        ctx.beginPath()
        ctx.arc(centerX, centerY, pulseRadius + 3, 0, Math.PI * 2)
        ctx.stroke()

        // Text inside canvas
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 12px Inter, sans-serif'
        ctx.textAlign = 'center'
        const label = isActive ? `${dim}% Dimming` : 'Ready'
        ctx.fillText(label, centerX, centerY + 4)

        if (isBeat && isActive) {
          ctx.fillStyle = '#ff0055'
          ctx.font = 'bold 11px Inter, sans-serif'
          ctx.fillText('⚡ BEAT', centerX, centerY - pulseRadius - 10)
        }
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
      desc: 'Bass = Warmth, Mids = Green/Gold, Treble = Blue/Violet',
      icon: <LuAudioLines size={22} className="text-pink-400" />
    },
    {
      id: 'mood',
      title: 'Harmonic Mood',
      desc: 'Traverses color palette smoothly with musical timbre',
      icon: <LuSparkles size={22} className="text-yellow-400" />
    },
    {
      id: 'pulse',
      title: 'Beat Pulse',
      desc: 'Punchy brightness flashes on kick drums & bass hits',
      icon: <LuZap size={22} className="text-orange-400" />
    },
    {
      id: 'cycle',
      title: 'Beat Cycle',
      desc: 'Steps to the next harmonic color on every musical beat',
      icon: <LuDisc size={22} className="text-cyan-400" />
    },
    {
      id: 'ambient',
      title: 'Ambient Glow',
      desc: 'Silky, relaxed breathing light with zero jarring strobe',
      icon: <LuActivity size={22} className="text-emerald-400" />
    }
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LuMusic className="text-blue-500" size={28} />
            <h1 className="text-3xl font-bold tracking-tight">Music Sync</h1>
          </div>
          <p className="text-neutral-400 text-sm mt-1">
            Real-time, intelligent sound-to-light synchronization for your WiZ bulbs
          </p>
        </div>

        {/* Big Start / Stop Button */}
        <div className="flex items-center gap-3">
          <Button
            size="large"
            variant={isActive ? 'danger' : 'primary'}
            onClick={handleToggleSync}
            className={`flex items-center gap-2 px-6 py-3 font-semibold shadow-lg transition-transform ${
              isActive ? 'hover:scale-105 animate-pulse' : 'hover:scale-105'
            }`}
          >
            {isActive ? <LuPause size={20} /> : <LuPlay size={20} />}
            <span>{isActive ? 'Stop Music Sync' : 'Start Music Sync'}</span>
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-200 px-4 py-3 rounded-lg text-sm">
          {statusMessage}
        </div>
      )}

      {/* Live Visualizer Stage */}
      <Card variant="primary" padding="small" className="overflow-hidden border border-neutral-800">
        <canvas
          ref={canvasRef}
          width={800}
          height={220}
          className="w-full h-56 rounded-md block bg-neutral-950"
        />
      </Card>

      {/* Target Bulb & Audio Source Configuration Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Audio Source Card */}
        <Card variant="secondary" padding="medium" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold text-sm">
            <LuSlidersHorizontal size={18} className="text-blue-400" />
            <span>Audio Source</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (isActive) musicSyncEngine.stop()
                setIsActive(false)
                setAudioSource('loopback')
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition ${
                audioSource === 'loopback'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
              }`}
            >
              <LuMonitor size={16} />
              <span>PC System Audio (Loopback)</span>
            </button>

            <button
              onClick={() => {
                if (isActive) musicSyncEngine.stop()
                setIsActive(false)
                setAudioSource('mic')
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition ${
                audioSource === 'mic'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
              }`}
            >
              <LuMic size={16} />
              <span>Microphone / Input</span>
            </button>
          </div>

          {audioSource === 'mic' && audioDevices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-white text-xs rounded-md px-3 py-2 mt-1 focus:outline-none focus:border-blue-500"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
        </Card>

        {/* Target Bulb Card */}
        <Card variant="secondary" padding="medium" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-neutral-300 font-semibold text-sm">
            <LuSparkles size={18} className="text-yellow-400" />
            <span>Target Light Bulb(s)</span>
          </div>

          <div className="flex gap-2 items-center">
            <select
              value={targetBulb}
              onChange={(e) => setTargetBulb(e.target.value)}
              className="flex-1 bg-neutral-900 border border-neutral-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
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
          <p className="text-xs text-neutral-400">
            WiZ UDP streaming sends fire-and-forget packets (~13 Hz) to prevent lag.
          </p>
        </Card>
      </div>

      {/* Sync Mode Selector */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-neutral-200">Synchronization Mode</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {modes.map((m) => {
            const isSelected = mode === m.id
            return (
              <div
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-4 rounded-xl cursor-pointer transition border text-left flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 shadow-md shadow-blue-500/10'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  {m.icon}
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">{m.title}</h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-snug">{m.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Color Palette Selector (for Mood, Pulse, Cycle & Ambient) */}
      {mode !== 'spectrum' && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-200">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {PALETTES.map((p) => {
              const isSelected = palette === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className={`p-3 rounded-xl cursor-pointer transition border flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500 shadow-md shadow-blue-500/10'
                      : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 justify-center py-1">
                    {p.colors.map((c, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full border border-black/30 shadow-sm"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-center text-neutral-200">
                    {p.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Deep Tuning Sliders */}
      <Card variant="secondary" padding="large" className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
          <LuSlidersHorizontal size={20} className="text-blue-400" />
          <span>Intelligent DSP Tuning</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Sensitivity */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-neutral-300">
              <span className="font-medium">Audio Sensitivity</span>
              <span className="text-blue-400 font-mono">{Math.round(sensitivity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="accent-blue-500 cursor-pointer"
            />
            <span className="text-[11px] text-neutral-500">
              Increases light responsiveness on lower volume
            </span>
          </div>

          {/* Smoothing */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-neutral-300">
              <span className="font-medium">Color Smoothing</span>
              <span className="text-blue-400 font-mono">
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
              className="accent-blue-500 cursor-pointer"
            />
            <span className="text-[11px] text-neutral-500">
              Interpolation speed between color changes
            </span>
          </div>

          {/* Min / Max Brightness */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-neutral-300">
              <span className="font-medium">Brightness Range</span>
              <span className="text-blue-400 font-mono">
                {minBrightness}% - {maxBrightness}%
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                value={minBrightness}
                onChange={(e) => setMinBrightness(parseInt(e.target.value))}
                className="accent-blue-500 cursor-pointer flex-1"
                title="Minimum Brightness"
              />
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={maxBrightness}
                onChange={(e) => setMaxBrightness(parseInt(e.target.value))}
                className="accent-blue-500 cursor-pointer flex-1"
                title="Maximum Brightness"
              />
            </div>
            <span className="text-[11px] text-neutral-500">
              Floor: {minBrightness}% | Ceiling: {maxBrightness}%
            </span>
          </div>

          {/* Beat Threshold */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-neutral-300">
              <span className="font-medium">Beat Kick Sensitivity</span>
              <span className="text-blue-400 font-mono">{Math.round(beatSensitivity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={beatSensitivity}
              onChange={(e) => setBeatSensitivity(parseFloat(e.target.value))}
              className="accent-blue-500 cursor-pointer"
            />
            <span className="text-[11px] text-neutral-500">
              Spectral flux threshold for drum hit detection
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
