import { ICON } from '@constants'
import i18n from '@i18n'
import BulbManager from '@main/bulbManager'
import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import log from 'electron-log'
import fs from 'fs'
import path from 'path'

const getTrayIcon = () => {
  const candidates = [
    ICON,
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'icon.ico'),
    path.join(process.resourcesPath || '', 'resources', 'icon.ico'),
    path.join(__dirname, '../../resources/icon.ico')
  ]
  for (const c of candidates) {
    if (c && typeof c === 'string' && fs.existsSync(c)) {
      return c
    }
  }
  // Fallback to empty 16x16 icon so Tray never throws
  return nativeImage.createEmpty()
}

const createTray = (mainWindow: BrowserWindow, app: Electron.App, bulbHelper: BulbManager) => {
  try {
    const iconImage = getTrayIcon()
    const tray = new Tray(iconImage)
    const contextMenu = Menu.buildFromTemplate([
      {
        label: i18n.t('tray.show'),
        click: () => {
          log.info('Tray show option clicked, restoring window...')
          mainWindow.show()
          log.debug('Window size is:', mainWindow.getSize())
        }
      },
      { type: 'separator' },
      {
        label: i18n.t('tray.toggle'),
        click: () => {
          log.debug('Toggling active bulb from tray...')
          bulbHelper.toggleBulb()
        }
      },
      { type: 'separator' },
      {
        label: i18n.t('tray.quit'),
        click: () => {
          log.info('Quitting app from tray...')
          app.quit()
        }
      }
    ])

    tray.setToolTip('WiZ App')
    tray.setContextMenu(contextMenu)
    tray.on('click', () => {
      log.info('Tray icon clicked, restoring window...')
      mainWindow.show()
    })
  } catch (error) {
    log.error('Failed to create system tray:', error)
  }
}

export default createTray
