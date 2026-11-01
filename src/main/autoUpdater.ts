import log from 'electron-log'
import path from 'path'

export default function checkForUpdates() {
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.logger = log
    if (process.env.NODE_ENV === 'development') {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.allowPrerelease = true
      autoUpdater.updateConfigPath = path.join(path.resolve(), 'dev-app-update.yml')
    }

    autoUpdater.checkForUpdatesAndNotify()

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...')
    })

    autoUpdater.on('update-available', (info: any) => {
      log.info('Update available.', info)
    })

    autoUpdater.on('update-not-available', (info: any) => {
      log.info('Update not available.', info)
    })

    autoUpdater.on('error', (err: any) => {
      log.error('Error in auto-updater.', err)
    })

    autoUpdater.on('download-progress', (progress: any) => {
      log.info('Download progress...', progress)
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      log.info('Update downloaded.', info)
    })
  } catch (err) {
    log.error('Failed to initialize auto-updater:', err)
  }
}
