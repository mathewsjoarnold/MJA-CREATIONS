import BrightnessSlider from '@components/ui/BrightnessSlider'
import PowerButton from '@components/ui/PowerButton'
import { useBulbStore } from '@renderer/context/BulbStore'
import { LuLayers, LuLoaderCircle, LuRefreshCw } from 'react-icons/lu'

export default function BulbShortcut() {
  const activeBulb = useBulbStore((state) => state.activeBulb)
  const isAllSelected = useBulbStore((state) => state.isAllSelected)
  const bulbs = useBulbStore((state) => state.bulbs)
  const toggleBulb = useBulbStore((state) => state.toggleBulb)
  const reconnectBulb = useBulbStore((state) => state.reconnectBulb)

  if (!activeBulb && (!isAllSelected || bulbs.length === 0)) return null

  if (isAllSelected && bulbs.length > 0) {
    const isAnyOn = bulbs.some((b) => b.state)
    const isAllOn = bulbs.every((b) => b.state)
    const anyConnecting = bulbs.some((b) => b.connectionStatus === 'connecting')
    const displayName = bulbs.length === 2 ? 'Both Lights (Linked)' : `All Bulbs (${bulbs.length})`

    return (
      <div className="text-white px-4 py-2.5 bg-secondary rounded-xl animate-steps-modern animate-pulse-fade-in relative overflow-hidden ring-1 ring-primary/40 shadow-md">
        <div className="flex justify-between items-center mb-3">
          <div className="flex flex-col min-w-0 mr-2">
            <p className="font-semibold overflow-hidden text-ellipsis whitespace-nowrap text-sm text-primary flex items-center gap-1.5" title={displayName}>
              <LuLayers size={13} className="shrink-0" />
              <span>{displayName}</span>
            </p>
            <div className="flex items-center gap-1.5 text-xs mt-0.5">
              <span className="text-neutral-300 font-bold">
                {isAllOn ? 'All On' : isAnyOn ? 'Partially On' : 'All Off'}
              </span>
              {anyConnecting && (
                <span className="text-cyan-400 text-[10px] animate-pulse">Syncing...</span>
              )}
            </div>
          </div>
          <PowerButton isOn={isAnyOn} onToggle={toggleBulb} />
        </div>
        <BrightnessSlider />
      </div>
    )
  }

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
