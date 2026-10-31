import { useBulbStore } from '@renderer/context/BulbStore'
import { BulbState } from '@shared/types/bulbState'
import { useTranslation } from 'react-i18next'
import { LuCircleCheck, LuCpu, LuLoaderCircle } from 'react-icons/lu'

export default function Information() {
  const bulbs = useBulbStore((state) => state.bulbs)
  const activeBulb = useBulbStore((state) => state.activeBulb)
  const isDiscovering = useBulbStore((state) => state.isDiscovering)
  const { t } = useTranslation()

  const renderLabel = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') return null
    return (
      <p className="leading-relaxed">
        <span className="font-medium text-neutral-300 me-2">{name}:</span>
        <span className="text-neutral-100 font-normal">{value}</span>
      </p>
    )
  }

  const renderCardInfo = (bulb: BulbState) => {
    const isConnected = bulb.connectionStatus === 'connected'
    const isConnecting = bulb.connectionStatus === 'connecting'
    const isOffline = bulb.connectionStatus === 'offline'
    const isActive = bulb.ip === activeBulb?.ip

    return (
      <article
        key={bulb.ip}
        className={`flex bg-secondary-700 rounded-xl px-6 py-5 flex-col shadow-lg border transition-all duration-200 ${
          isActive
            ? 'border-primary/60 ring-2 ring-primary/40 shadow-[0_0_20px_rgba(55,114,255,0.2)]'
            : 'border-neutral-700/60 hover:border-neutral-600'
        }`}
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-700/50">
          <div className="flex items-center gap-2 min-w-0">
            <LuCpu size={28} strokeWidth={1} className={isActive ? 'text-primary' : 'text-neutral-400'} />
            <h2 className="text-2xl font-semibold overflow-hidden text-ellipsis whitespace-nowrap" title={bulb.name}>
              {bulb.name}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isActive && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/20 text-blue-300 border border-primary/30">
                Active
              </span>
            )}
            {isConnected && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <LuCircleCheck size={13} />
                <span>{bulb.state ? 'ON' : 'OFF'}</span>
              </span>
            )}
            {isConnecting && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <LuLoaderCircle size={13} className="animate-spin" />
                <span>Connecting</span>
              </span>
            )}
            {isOffline && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <LuLoaderCircle size={13} className="animate-spin text-amber-400" />
                <span>Auto-Reconnecting</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 lg:text-lg leading-normal flex flex-col gap-0.5">
          {renderLabel(t('information.moduleName'), bulb.moduleName || 'WiZ Bulb')}
          {renderLabel(t('information.ip'), bulb.ip)}
          {renderLabel(t('information.port'), bulb.port || 38899)}
          {renderLabel(t('information.mac'), bulb.mac || 'N/A')}
          {renderLabel(t('information.state'), bulb.state ? 'ON' : 'OFF')}
          {bulb.dimming !== undefined && renderLabel('Brightness', `${bulb.dimming}%`)}
          {renderLabel(t('information.sceneId'), bulb.sceneId ?? 0)}
          {renderLabel(t('information.firmwareVersion'), bulb.fwVersion || 'N/A')}
          {renderLabel(t('information.homeId'), bulb.homeId || 'N/A')}
          {renderLabel(t('information.roomId'), bulb.roomId || 'N/A')}
          {bulb.rssi ? renderLabel('Signal (RSSI)', `${bulb.rssi} dBm`) : null}
        </div>
      </article>
    )
  }

  return (
    <section className="py-8 px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-4xl">{t('information.title')}</h1>
          <h2 className="text-sm lg:text-lg mt-2 text-neutral-400 font-medium">
            {t('information.subtitle')}
          </h2>
        </div>
        {bulbs.length > 0 && (
          <span className="text-xs font-medium text-neutral-400 bg-secondary px-3 py-1.5 rounded-lg border border-neutral-700/50">
            {bulbs.length} {bulbs.length === 1 ? 'bulb available' : 'bulbs available'}
          </span>
        )}
      </div>

      {bulbs.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl">
          {bulbs.map((b) => renderCardInfo(b))}
        </div>
      ) : isDiscovering ? (
        <div className="flex items-center gap-3 mt-14 text-neutral-400">
          <LuLoaderCircle size={22} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Discovering WiZ bulbs...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-14 rounded-xl py-5 w-fit text-neutral-400">
          <p className="my-12 text-center text-neutral-500 font-bold text-sm">
            {t('information.missing')}
          </p>
        </div>
      )}
    </section>
  )
}
