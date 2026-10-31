import BrightnessSlider from '@components/ui/BrightnessSlider'
import PowerButton from '@components/ui/PowerButton'
import { useBulbStore } from '@renderer/context/BulbStore'
import { LuLoaderCircle, LuRefreshCw } from 'react-icons/lu'

export default function BulbShortcut() {
  const activeBulb = useBulbStore((state) => state.activeBulb)
  const toggleBulb = useBulbStore((state) => state.toggleBulb)
  const reconnectBulb = useBulbStore((state) => state.reconnectBulb)

  if (!activeBulb) return null

  const isConnecting = activeBulb.connectionStatus === 'connecting'
  const isConnected = activeBulb.connectionStatus === 'connected'
  const isOffline = activeBulb.connectionStatus === 'offline'

  return (
    <div className="text-white px-4 py-2.5 bg-secondary rounded-xl animate-steps-modern animate-pulse-fade-in relative overflow-hidden">
      {isConnecting && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
          <div className="w-full h-full bg-cyan-400 animate-shimmer-sweep" />
        </div>
      )}
      <div className="flex justify-between items-center mb-3">
        <div className="flex flex-col min-w-0 mr-2">
          <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            {activeBulb.name}
          </p>
          <div className="flex items-center gap-1.5 text-xs mt-0.5">
            {isConnecting && (
              <span className="flex items-center gap-1 text-cyan-400 font-medium text-[11px]">
                <LuLoaderCircle size={11} className="animate-spin" /> Connecting...
              </span>
            )}
            {isOffline && (
              <span className="flex items-center gap-1 text-rose-400 font-medium text-[11px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400" /> Offline
              </span>
            )}
            {isConnected && (
              <span className="text-neutral-300 font-bold">
                {activeBulb.state ? 'On' : 'Off'}
              </span>
            )}
          </div>
        </div>
        {isConnecting ? (
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5">
            <LuLoaderCircle size={15} className="animate-spin text-cyan-400" />
          </div>
        ) : isOffline ? (
          <button
            type="button"
            onClick={() => reconnectBulb(activeBulb.ip)}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            title="Reconnect"
          >
            <LuRefreshCw size={13} className="text-neutral-300" />
          </button>
        ) : (
          <PowerButton isOn={activeBulb.state} onToggle={toggleBulb} />
        )}
      </div>
      <BrightnessSlider />
    </div>
  )
}
