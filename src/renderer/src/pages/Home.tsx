import BulbCard from '@renderer/components/BulbCard'
import FavoriteScene from '@renderer/components/FavoriteScene'
import AddDeviceModal from '@renderer/components/modals/AddDeviceModal'
import DeleteDialog from '@renderer/components/modals/DeleteDialog'
import EditNameModal from '@renderer/components/modals/EditNameModal'
import SearchBulbCard from '@renderer/components/SearchBulbCard'
import Button from '@renderer/components/ui/Button'
import { useBulbStore } from '@renderer/context/BulbStore'
import { HomeModalState, ModalType } from '@renderer/types/modals'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCirclePlus, LuLayers, LuSquarePen, LuToggleLeft, LuTrash } from 'react-icons/lu'

export default function Home() {
  const { bulbs, activeBulb, isAllSelected, setIsAllSelected, toggleSelectAll, isDiscovering, toggleBulbByIp, setActiveBulb, deleteBulb, reconnectBulb, isReady } =
    useBulbStore()
  const { t } = useTranslation()
  const [modals, setModals] = useState<HomeModalState>({
    edit: false,
    delete: false,
    ip: false
  })

  useEffect(() => {
    if (isReady) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          window.api.showWindow()
        })
      })
    }
  }, [isReady])

  // Track which bulb IP the kebab menu is targeting
  const [targetBulbIp, setTargetBulbIp] = useState<string | null>(null)

  const toggleModal = (modal: ModalType) => {
    setModals((prev) => ({ ...prev, [modal]: !prev[modal] }))
  }

  const handleDeleteBulb = () => {
    if (targetBulbIp) {
      deleteBulb(targetBulbIp)
    }
    toggleModal('delete')
    setTargetBulbIp(null)
  }

  // Build per-card menu items that target the specific bulb
  const getMenuItemsForBulb = useCallback(
    (ip: string) => [
      {
        label: t('home.toggle'),
        icon: <LuToggleLeft size={20} />,
        onClick: () => toggleBulbByIp(ip)
      },
      {
        label: t('home.edit.entry'),
        icon: <LuSquarePen size={20} />,
        onClick: () => {
          setTargetBulbIp(ip)
          toggleModal('edit')
        }
      },
      {
        label: t('home.delete.entry'),
        icon: <LuTrash size={20} />,
        onClick: () => {
          setTargetBulbIp(ip)
          toggleModal('delete')
        }
      }
    ],
    [t, toggleBulbByIp]
  )

  // Find the target bulb for delete dialog message
  const targetBulb = targetBulbIp ? bulbs.find((b) => b.ip === targetBulbIp) : activeBulb

  return (
    <section className="py-8 px-8">
      <h1 className="font-bold text-4xl">{t('home.title')}</h1>
      <h2 className="text-sm lg:text-lg mt-2 text-neutral-400 font-medium">{t('home.subtitle')}</h2>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-400 font-medium">
            {t('home.selectedBulb')}:{' '}
            {isAllSelected ? (
              <span className="text-primary font-semibold inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#3b82f6] animate-pulse" />
                {t('home.allBulbs', { defaultValue: 'All Bulbs' })} ({bulbs.length} {t('home.lightsLinked', { defaultValue: 'lights linked' })})
              </span>
            ) : activeBulb ? (
              <span className="text-primary font-semibold">{activeBulb.name}</span>
            ) : (
              <span className="text-neutral-500 font-semibold">{t('home.none', { defaultValue: 'None' })}</span>
            )}
          </p>
          {isAllSelected && (
            <p className="text-xs text-blue-400/80 mt-1 flex items-center gap-1.5">
              <span>✨ {t('home.syncHint', { defaultValue: 'Any mode, effect, or brightness applied will sync to both lights simultaneously' })}</span>
            </p>
          )}
        </div>

        {bulbs.length > 1 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 cursor-pointer shadow-md select-none active:scale-95 ${
              isAllSelected
                ? 'bg-primary hover:bg-primary-600 text-white ring-2 ring-primary/80 shadow-[0_0_18px_rgba(55,114,255,0.45)] font-semibold'
                : 'bg-secondary hover:bg-secondary-600 text-neutral-200 border border-neutral-700/60 hover:border-neutral-500'
            }`}
            title={
              isAllSelected
                ? t('home.allSelectedTooltip', { defaultValue: 'All bulbs are linked. Click to select bulbs individually.' })
                : t('home.selectAllTooltip', { defaultValue: 'Click to select and control both lights together.' })
            }
          >
            <LuLayers size={18} className={isAllSelected ? 'text-white' : 'text-neutral-400'} />
            <span>
              {isAllSelected
                ? bulbs.length === 2
                  ? t('home.bothSelected', { defaultValue: 'Both Lights Selected (Linked)' })
                  : t('home.allSelected', { defaultValue: 'All Bulbs Selected (Linked)' })
                : bulbs.length === 2
                  ? t('home.changeBoth', { defaultValue: 'Change Both Lights Together' })
                  : t('home.changeAll', { defaultValue: 'Change All Bulbs Together' })}
            </span>
          </button>
        )}
      </div>

      <article className="mt-4 grid grid-cols-3 gap-x-4 gap-y-4 lg:gap-y-6 lg:grid-cols-4 xl:grid-cols-5">
        {bulbs.map((b) => (
          <BulbCard
            key={b.ip}
            bulb={b}
            isActive={isAllSelected || b.ip === activeBulb?.ip}
            isGroupActive={isAllSelected}
            onSelect={() => {
              if (isAllSelected) {
                setIsAllSelected(false)
              }
              setActiveBulb(b.ip)
            }}
            onToggle={() => toggleBulbByIp(b.ip)}
            onReconnect={() => reconnectBulb(b.ip)}
            menuItems={getMenuItemsForBulb(b.ip)}
          />
        ))}
        {isDiscovering && bulbs.length === 0 && <SearchBulbCard />}
        <Button
          variant="secondary"
          onClick={() => toggleModal('ip')}
          className="flex flex-col items-center justify-center w-full h-31 g-1"
        >
          <LuCirclePlus size={32} strokeWidth={1} />
          <p className="mt-2 text-lg">{t('home.add.entry')}</p>
        </Button>
      </article>

      {targetBulb && (
        <>
          <EditNameModal
            isOpen={modals.edit}
            onClose={() => toggleModal('edit')}
            targetBulb={targetBulb}
          />
          <DeleteDialog
            isOpen={modals.delete}
            onClose={() => toggleModal('delete')}
            title={t('home.delete.title')}
            description={`${t('home.delete.message')} "${targetBulb.name}"?`}
            onConfirm={handleDeleteBulb}
          />
        </>
      )}

      <AddDeviceModal isOpen={modals.ip} onClose={() => toggleModal('ip')} />

      <article className="mt-8 w-full">
        <FavoriteScene />
      </article>
    </section>
  )
}
