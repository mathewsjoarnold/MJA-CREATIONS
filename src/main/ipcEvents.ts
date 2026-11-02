import i18n from '@i18n'
import BulbManager from '@main/bulbManager'
import { app, desktopCapturer, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'

const registerIPCEvents = (BulbManager: BulbManager) => {
  // --- Active bulb operations ---
  ipcMain.on('toggle-bulb-state', async (_, targetIp?: string) => {
    await BulbManager.toggleBulb(targetIp)
  })

  ipcMain.on('set-brightness', async (_, brightness: number, targetIp?: string) => {
    await BulbManager.setBrightness(brightness, targetIp)
  })

  ipcMain.on('set-bulb-name', async (_, name, ip) => {
    await BulbManager.setBulbName(name, ip)
  })

  ipcMain.on('set-scene', async (_, sceneId: number, targetIp?: string) => {
    await BulbManager.setScene(sceneId, targetIp)
  })

  ipcMain.on('add-custom-color', async (_, colorName, colorHex) => {
    await BulbManager.addCustomColor(colorName, colorHex)
  })

  ipcMain.on('sync-bulb-color', (_, data: { r: number; g: number; b: number; dimming?: number; ip?: string; temp?: number; state?: boolean }) => {
    BulbManager.syncBulbColor(data.r, data.g, data.b, data.dimming, data.ip, data.temp, data.state)
  })

  ipcMain.on('set-custom-color', async (_, colorId: number, targetIp?: string) => {
    await BulbManager.setCustomColor(colorId, targetIp)
  })

  ipcMain.on('edit-color', async (_, colorId, colorName, colorHex) => {
    await BulbManager.editCustomColor(colorId, colorName, colorHex)
  })

  ipcMain.on('remove-color', async (_, colorId) => {
    await BulbManager.removeCustomColor(colorId)
  })

  ipcMain.on('toggle-favorite-color', async (_, colorId) => {
    await BulbManager.toggleFavoriteColor(colorId)
  })

  ipcMain.on('set-favorite-colors-order', async (_, favoriteColors) => {
    await BulbManager.setFavoriteColorsOrder(favoriteColors)
  })

  // --- Multi-bulb operations ---
  ipcMain.on('set-active-bulb', (_, ip) => {
    BulbManager.setActiveBulb(ip)
  })

  ipcMain.on('toggle-bulb-by-ip', async (_, ip) => {
    await BulbManager.toggleBulbByIp(ip)
  })

  ipcMain.on('add-bulb-by-ip', async (_, ip) => {
    await BulbManager.addBulbByIp(ip)
  })

  ipcMain.on('delete-bulb', (_, ip) => {
    BulbManager.deleteBulb(ip)
  })

  ipcMain.on('reconnect-bulb', async (_, ip: string) => {
    await BulbManager.reconnectBulb(ip)
  })

  ipcMain.on('retry-discovery', async () => {
    await BulbManager.retryDiscovery()
  })

  ipcMain.on('delete-profile', () => {
    BulbManager.deleteProfile()
  })

  // --- Queries ---
  ipcMain.handle('get-desktop-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle('get-bulbs', () => {
    return BulbManager.getMultiBulbState()
  })

  ipcMain.handle('check-for-updates', async () => {
    const result = await autoUpdater.checkForUpdates()

    autoUpdater.on('update-available', () => {
      return true
    })

    autoUpdater.on('update-not-available', () => {
      return false
    })

    return result?.updateInfo && result.versionInfo
      ? result.updateInfo.version !== result.versionInfo.version
      : false
  })

  ipcMain.handle('get-language', () => {
    return i18n.language
  })

  ipcMain.handle('get-version', () => {
    return app.getVersion()
  })

  // --- Utility ---
  ipcMain.on('open-app-folder', () => {
    shell.openPath(app.getPath('userData'))
  })
}

export default registerIPCEvents
