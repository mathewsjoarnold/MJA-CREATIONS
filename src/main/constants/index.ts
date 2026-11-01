import icon from '@resources/icon.ico?asset'
import { app } from 'electron'
import path from 'node:path'

const ICON = icon
const CONFIG = (app && typeof app.getPath === 'function')
  ? path.join(app.getPath('userData'), 'config.json')
  : path.join(process.env.APPDATA || '', 'Wiz App', 'config.json')
const MIN_WIDTH = 900
const MIN_HEIGHT = 600
const HIDE_MENU = true
const DISCOVER_DELAY = 5000
const DISCOVER_TIMEOUT = 5000
const SANDBOX = false

export { CONFIG, DISCOVER_DELAY, DISCOVER_TIMEOUT, HIDE_MENU, ICON, MIN_HEIGHT, MIN_WIDTH, SANDBOX }
