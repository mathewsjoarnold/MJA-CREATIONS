import Card from '@components/ui/Card'
import KebabMenu from '@components/ui/KebabMenu'
import PowerButton from '@components/ui/PowerButton'
import { BulbState } from '@shared/types/bulbState'
import { ReactNode, useState } from 'react'
import { LuLoaderCircle, LuRefreshCw } from 'react-icons/lu'

type BulbCardProps = {
  bulb: BulbState
  isActive: boolean
  onSelect: () => void
  onToggle: () => void
  onReconnect?: () => void
  menuItems: {
    icon: ReactNode
    label: string
    onClick: () => void
  }[]
}

export default function BulbCard({
  bulb,
  isActive,
  onSelect,
  onToggle,
  onReconnect,
  menuItems
}: BulbCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isConnecting = bulb.connectionStatus === 'connecting'
  const isConnected = bulb.connectionStatus === 'connected'
  const isOffline = bulb.connectionStatus === 'offline'

  return (
    <Card
      className={`w-full min-h-[8.25rem] py-3 px-4 relative flex flex-col justify-between transition-all duration-300 ${
        isActive
          ? 'shadow-[0_0_16px_rgba(55,114,255,0.45)] ring-2 ring-primary/80 brightness-105'
          : 'opacity-85 hover:opacity-100 hover:shadow-md'
      } ${isMenuOpen ? 'z-50' : 'z-auto'} ${
        isConnecting ? 'ring-1 ring-blue-500/40 bg-gradient-to-br from-secondary via-secondary to-blue-950/20' : ''
      }`}
      variant={bulb.state && isConnected ? 'primary' : 'secondary'}
      active={isActive}
      onClick={onSelect}
    >
      {/* Top animated glowing shimmer bar when connecting */}
      {isConnecting && (
        <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden rounded-t-md bg-neutral-800/60">
          <div className="w-full h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 animate-shimmer-sweep" />
        </div>
      )}

      {/* Top Header: Bulb Name + Status Badge */}
      <div>
        <div className="flex justify-between items-start gap-2">
          <p
            className="text-base font-semibold overflow-hidden text-ellipsis whitespace-nowrap flex-1"
            title={bulb.name}
          >
            {bulb.name}
          </p>

          {isConnecting && (
            <span
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30 shrink-0"
              title="Connecting to bulb"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
              </span>
              <span>Connecting</span>
            </span>
          )}

          {isOffline && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0"
              title="Bulb is offline"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400"></span>
              <span>Offline</span>
            </span>
          )}

          {isConnected && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0"
              title="Connected"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
              <span>{bulb.state ? 'On' : 'Off'}</span>
            </span>
          )}
        </div>

        {/* Subtitle Info: IP address + Dimming / RSSI */}
        <div className="flex items-center justify-between text-xs text-neutral-400 mt-1">
          <span className="font-mono text-[11px] text-neutral-400/90">{bulb.ip}</span>
          {isConnected && bulb.dimming !== undefined && (
            <span className="text-[11px] font-medium text-neutral-300">{bulb.dimming}%</span>
          )}
          {isConnecting && (
            <span className="text-[10px] text-blue-400/90 animate-pulse font-medium">Syncing...</span>
          )}
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="mt-3 flex justify-between items-center">
        {isConnecting ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium">
            <LuLoaderCircle size={13} className="animate-spin text-cyan-400" />
            <span className="animate-pulse text-[11px]">Connecting...</span>
          </div>
        ) : isOffline ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReconnect?.()
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 active:scale-95 text-neutral-200 border border-white/10 transition-all cursor-pointer shadow-sm"
            title="Retry connecting to this bulb"
          >
            <LuRefreshCw size={12} className="text-neutral-400" />
            <span>Reconnect</span>
          </button>
        ) : (
          <PowerButton isOn={bulb.state} onToggle={onToggle} />
        )}

        <KebabMenu items={menuItems} onOpenChange={setIsMenuOpen} />
      </div>
    </Card>
  )
}
