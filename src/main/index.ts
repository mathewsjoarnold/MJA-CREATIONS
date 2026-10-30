import { HIDE_MENU, ICON, MIN_HEIGHT, MIN_WIDTH, SANDBOX } from '@constants'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import checkForUpdates from '@main/autoUpdater'
import BulbManager from '@main/bulbManager'
import registerIPCEvents from '@main/ipcEvents'
import initializeLanguage from '@main/localization'
import initializeLogger from '@main/logger'
import createTray from '@main/tray'
import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, shell } from 'electron'
import log from 'electron-log'
import { join } from 'path'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    height: MIN_HEIGHT,
    width: MIN_WIDTH,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    icon: ICON,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'WiZ APP',
    autoHideMenuBar: HIDE_MENU,
    ...(process.platform === 'linux' ? { icon: ICON } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: !app.isPackaged,
      sandbox: SANDBOX
    }
  })

  ipcMain.on('show-window', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const window = windows[0]
      if (!window.isVisible()) {
        window.show()
      }
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    }
  })

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    checkForUpdates()

    // Set app user model id for windows
    electronApp.setAppUserModelId('com.wiz-app')
    app.setName('Wiz App')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initializeLogger()
    initializeLanguage(app)

    const mainWindow = createWindow()

    // Enable system loopback audio capture for Music Sync on Windows
    if (typeof mainWindow.webContents.session.setDisplayMediaRequestHandler === 'function') {
      mainWindow.webContents.session.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (sources.length > 0) {
            callback({ video: sources[0], audio: 'loopback' })
          } else {
            callback({ video: null as any })
          }
        })
        .catch((error) => {
          log.error('Failed to get desktop capturer sources for audio loopback:', error)
          callback({ video: null as any })
        })
      })
    }

    // Grant media permissions automatically without prompts
    mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
      return permission === 'media' || (permission as string) === 'display-capture'
    })
    mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || (permission as string) === 'display-capture')
    })

    // Disable menu completely (prevents showing menu when Alt or Ctrl is pressed)
    if (HIDE_MENU && process.platform !== 'darwin') {
      Menu.setApplicationMenu(null)
    }

    const bulbHelper = new BulbManager(mainWindow)
    registerIPCEvents(bulbHelper)

    mainWindow.once('ready-to-show', () => {
      createTray(mainWindow, app, bulbHelper)
    })

    mainWindow.on('close', () => {
      log.info('Closing app...')
      bulbHelper.endConnection()
    })

    mainWindow.on('minimize', () => {
      log.info('Hiding app to tray...')
      mainWindow.hide()
    })

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
