import { AppConfig, BulbConfigEntry } from '@/types/bulbConfig'
import { systemConfig } from '@/types/systemConfig'
import { CONFIG } from '@constants'
import { Bulb, discover, SCENES } from '@lib/wikari/src/mod'
import { MAX_DEFAULT_COLORS } from '@shared/constants'
import { BulbState } from '@shared/types/bulbState'
import { MultiBulbState } from '@shared/types/multiBulbState'
import { ToastMessage } from '@shared/types/toastMessage'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import fs from 'fs'

const MAX_DISCOVERY_RETRIES = 3
const DISCOVERY_RETRY_DELAY_MS = 1000

/**
 * Decorator that updates the view after the method is executed.
 * Also catches if the connection is lost.
 */
function needsViewUpdate(actionName: string) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: never[]) {
      const instance = this as BulbManager
      try {
        log.info(`Executing: ${actionName}`)
        await originalMethod.apply(this, args)
        instance.sendStateToRenderer()
      } catch (error) {
        log.error(`Failed to ${actionName}:`, error)
      }
    }
  }
}

class BulbManager {
  // Map of connected bulbs keyed by IP
  private bulbs: Map<string, Bulb> = new Map()
  private bulbStates: Map<string, BulbState> = new Map()

  // App-level config
  private appData: AppConfig

  // Active bulb
  private activeBulbIp: string | null = null

  // Discovery state
  private isDiscovering: boolean = false
  private discoveryFailed: boolean = false

  // Background auto-reconnect timer
  private reconnectTimer: ReturnType<typeof setInterval> | null = null

  // Window reference
  public window: BrowserWindow

  constructor(window: BrowserWindow) {
    this.window = window
    this.appData = this.getConfigData()
    this.initKnownBulbs()
    this.init()
    this.startAutoReconnectDaemon()
  }

  private async init() {
    await this.discoverBulbs()
  }

  // --- Pre-populate Known Bulbs so UI never appears empty ---
  private initKnownBulbs() {
    for (const entry of this.appData.bulbs) {
      if (!this.bulbStates.has(entry.bulbIp)) {
        this.bulbStates.set(entry.bulbIp, {
          ip: entry.bulbIp,
          name: entry.bulbName || 'WiZ Bulb',
          port: 38899,
          mac: '',
          rssi: 0,
          state: false,
          sceneId: 0,
          homeId: 0,
          roomId: 0,
          rgn: '',
          moduleName: 'WiZ Bulb',
          fwVersion: '',
          groupId: 0,
          ping: 0,
          customColors: this.appData.customColors,
          favoriteColors: this.appData.favoriteColors,
          connectionStatus: 'connecting'
        })
      }
    }

    if (!this.activeBulbIp && this.appData.activeBulbIp) {
      this.activeBulbIp = this.appData.activeBulbIp
    } else if (!this.activeBulbIp && this.appData.bulbs.length > 0) {
      this.activeBulbIp = this.appData.bulbs[0].bulbIp
    }
  }

  // --- Config Management ---

  private getConfigData(): AppConfig {
    const defaultData: AppConfig = {
      bulbs: [
        { bulbIp: '192.168.20.6', bulbName: 'ESP25_SHRGB_01' },
        { bulbIp: '192.168.20.7', bulbName: 'ESP01_SHRGB1C_31' }
      ],
      activeBulbIp: '192.168.20.6',
      customColors: [],
      favoriteColors: [
        SCENES['Warm White'],
        SCENES['Daylight'],
        SCENES['Night Light'],
        SCENES['Cozy']
      ]
    }

    let loaded: AppConfig | null = null

    // 1. Try reading primary config file
    try {
      if (fs.existsSync(CONFIG)) {
        const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf-8'))
        if (raw && Array.isArray(raw.bulbs) && Array.isArray(raw.customColors)) {
          loaded = raw as AppConfig
        }
      }
    } catch (e) {
      log.warn('Could not read primary config.json:', e)
    }

    // 2. Try reading backup file if primary was corrupt or empty
    if (!loaded || loaded.bulbs.length === 0) {
      try {
        const bakPath = CONFIG + '.bak'
        if (fs.existsSync(bakPath)) {
          const bakRaw = JSON.parse(fs.readFileSync(bakPath, 'utf-8'))
          if (bakRaw && Array.isArray(bakRaw.bulbs) && bakRaw.bulbs.length > 0) {
            log.info('Recovered bulbs from config.json.bak')
            loaded = bakRaw as AppConfig
          }
        }
      } catch {}
    }

    // 3. If still empty, seed default known bulbs to ensure user never loses them
    if (!loaded || loaded.bulbs.length === 0) {
      log.info('Seeding default configured bulbs:', defaultData.bulbs.map((b) => b.bulbIp))
      loaded = { ...defaultData, ...(loaded || {}) }
      loaded.bulbs = [...defaultData.bulbs]
      if (!loaded.activeBulbIp) loaded.activeBulbIp = defaultData.activeBulbIp
    }

    return loaded
  }

  /**
   * Robust config saver: NEVER deletes offline bulbs from disk!
   * Merges existing saved bulbs with connected bulbs.
   */
  private saveConfig() {
    const bulbMap = new Map<string, BulbConfigEntry>()

    // Retain all existing configured bulbs
    for (const b of this.appData.bulbs) {
      if (b && b.bulbIp) {
        bulbMap.set(b.bulbIp, { ...b })
      }
    }

    // Update names from connected bulbs
    for (const [ip, state] of this.bulbStates) {
      if (ip && state) {
        const existing = bulbMap.get(ip)
        bulbMap.set(ip, {
          bulbIp: ip,
          bulbName: state.name || existing?.bulbName || 'WiZ Bulb'
        })
      }
    }

    this.appData.bulbs = Array.from(bulbMap.values())
    if (this.activeBulbIp) {
      this.appData.activeBulbIp = this.activeBulbIp
    }

    try {
      const dataStr = JSON.stringify(this.appData, null, 2)
      fs.writeFileSync(CONFIG, dataStr)
      fs.writeFileSync(CONFIG + '.bak', dataStr)
    } catch (e) {
      log.error('Failed to save config to disk:', e)
    }
  }

  private deleteConfig() {
    try {
      fs.unlinkSync(CONFIG)
      fs.unlinkSync(CONFIG + '.bak')
    } catch {
      log.warn('Config file not found to delete')
    }
  }

  // --- Discovery Engine ---

  async discoverBulbs() {
    this.isDiscovering = true
    this.discoveryFailed = false
    this.sendStateToRenderer()

    const savedIps = this.appData.bulbs.map((b) => b.bulbIp)

    // Phase 1: Parallel unicast probing of all saved IPs with retries
    if (savedIps.length > 0) {
      log.info('Phase 1: Probing saved bulb IPs in parallel:', savedIps)

      for (let attempt = 0; attempt < MAX_DISCOVERY_RETRIES; attempt++) {
        const pendingIps = savedIps.filter((ip) => {
          const state = this.bulbStates.get(ip)
          return !state || state.connectionStatus !== 'connected'
        })
        if (pendingIps.length === 0) break // All bulbs connected!

        await Promise.allSettled(
          pendingIps.map(async (ip) => {
            try {
              const res = await discover({ addr: ip, waitMs: 1800 })
              if (res.length > 0) {
                await this.connectBulb(res[0], ip)
              }
            } catch (err) {
              log.warn(`Discovery probe error for ${ip}:`, err)
            }
          })
        )

        if (this.bulbs.size >= savedIps.length) {
          log.info('Phase 1: All', this.bulbs.size, 'saved bulb(s) connected successfully')
          break
        }

        if (attempt < MAX_DISCOVERY_RETRIES - 1) {
          await this.delay(DISCOVERY_RETRY_DELAY_MS)
        }
      }
    }

    // Phase 2: Broadcast discovery (ONLY if no saved bulbs exist at all)
    if (savedIps.length === 0 && this.bulbs.size === 0) {
      log.info('Phase 2: Trying general broadcast discovery for new setup')
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await discover({ waitMs: 2500 })
          for (const bulb of res) {
            const ip = bulb.address
            if (!this.bulbs.has(ip)) {
              await this.connectBulb(bulb, ip)
            }
          }
        } catch (error) {
          log.error('Error during broadcast discovery:', error)
        }

        if (this.bulbs.size > 0) break
        await this.delay(DISCOVERY_RETRY_DELAY_MS)
      }
    }

    this.isDiscovering = false

    // Transition any bulb that did not respond to offline
    for (const state of this.bulbStates.values()) {
      if (state.connectionStatus !== 'connected') {
        state.connectionStatus = 'offline'
      }
    }

    // Only flag discoveryFailed if user has NO saved bulbs and NONE were found
    if (this.bulbs.size === 0 && savedIps.length === 0) {
      this.discoveryFailed = true
      log.error('Discovery failed: no bulbs found on network')
      this.sendToast({
        id: randomUUID(),
        message: 'toast.discoveryFailed',
        type: 'error',
        autoDismiss: false,
        retryAction: 'retry-discovery'
      })
    }

    // Assign active bulb
    if (this.bulbs.size > 0 && !this.activeBulbIp) {
      if (this.appData.activeBulbIp && this.bulbStates.has(this.appData.activeBulbIp)) {
        this.activeBulbIp = this.appData.activeBulbIp
      } else {
        this.activeBulbIp = this.bulbStates.keys().next().value ?? null
      }
    }

    this.saveConfig()
    this.sendStateToRenderer()
  }

  // --- Background Auto-Reconnect Daemon ---

  private startAutoReconnectDaemon() {
    if (this.reconnectTimer) return

    this.reconnectTimer = setInterval(async () => {
      const savedIps = this.appData.bulbs.map((b) => b.bulbIp)
      const disconnectedIps = savedIps.filter((ip) => {
        const state = this.bulbStates.get(ip)
        return !state || state.connectionStatus !== 'connected'
      })

      if (disconnectedIps.length === 0) return

      await Promise.allSettled(
        disconnectedIps.map(async (ip) => {
          try {
            const res = await discover({ addr: ip, waitMs: 1500 })
            if (res.length > 0) {
              await this.connectBulb(res[0], ip)
              log.info('Auto-reconnected bulb at', ip, '- Name:', this.bulbStates.get(ip)?.name)
              this.saveConfig()
              this.sendStateToRenderer()
            }
          } catch {}
        })
      )
    }, 4000)
  }

  private async connectBulb(bulb: Bulb, ip: string) {
    try {
      const state = await this.setUpSingleBulb(bulb, ip)
      this.bulbs.set(ip, bulb)
      this.bulbStates.set(ip, state)

      if (!this.activeBulbIp) {
        this.activeBulbIp = ip
      }

      log.info('Connected to bulb at', ip, '- Name:', state.name)
      this.sendStateToRenderer()
    } catch (error) {
      log.error('Failed to set up bulb at', ip, ':', error)
    }
  }

  private async setUpSingleBulb(bulb: Bulb, ip: string): Promise<BulbState> {
    const pilotResponse = await bulb.getPilot()
    const pilot = pilotResponse.result

    let configResult = {
      mac: '',
      rssi: 0,
      homeId: 0,
      roomId: 0,
      rgn: '',
      moduleName: 'WiZ Bulb',
      fwVersion: '1.0',
      groupId: 0,
      ping: 0
    }

    try {
      const bulbConfig = (await bulb.sendRaw({
        method: 'getSystemConfig',
        env: '',
        params: { mac: '', rssi: 0 }
      })) as systemConfig
      if (bulbConfig && bulbConfig.result) {
        configResult = { ...configResult, ...bulbConfig.result }
      }
    } catch {
      // Graceful fallback if getSystemConfig packet was dropped
    }

    const savedEntry = this.appData.bulbs.find((b) => b.bulbIp === ip)
    const name = savedEntry?.bulbName || configResult.moduleName || 'WiZ Bulb'

    return {
      ...pilot,
      ...configResult,
      ip: ip,
      port: bulb.bulbPort,
      name: name,
      customColors: this.appData.customColors,
      favoriteColors: this.appData.favoriteColors,
      connectionStatus: 'connected'
    }
  }

  // --- State Management ---

  public getActiveBulb(): BulbState | null {
    if (!this.activeBulbIp) return null
    return this.bulbStates.get(this.activeBulbIp) ?? null
  }

  private getActiveBulbInstance(): Bulb | null {
    if (!this.activeBulbIp) return null
    return this.bulbs.get(this.activeBulbIp) ?? null
  }

  public getMultiBulbState(): MultiBulbState {
    return {
      bulbs: Array.from(this.bulbStates.values()),
      activeBulb: this.getActiveBulb(),
      isDiscovering: this.isDiscovering,
      discoveryFailed: this.discoveryFailed
    }
  }

  public sendStateToRenderer() {
    this.window.webContents.send('on-update-bulb', this.getMultiBulbState())
  }

  private sendToast(toast: ToastMessage) {
    this.window.webContents.send('on-show-toast', toast)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  public setActiveBulb(ip: string) {
    if (this.bulbStates.has(ip)) {
      this.activeBulbIp = ip
      this.saveConfig()
      this.sendStateToRenderer()
    }
  }

  // --- User Operations ---

  @needsViewUpdate('toggle bulb by IP')
  public async toggleBulbByIp(ip: string) {
    const state = this.bulbStates.get(ip)
    if (!state) return

    let bulb = this.bulbs.get(ip)
    if (!bulb) {
      bulb = new Bulb(ip, { port: state.port || 38899 })
      this.bulbs.set(ip, bulb)
    }

    try {
      const nextState = !state.state
      state.state = nextState
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      bulb.sendRaw({ method: 'setPilot', params: { state: nextState } }, false).catch(() => {})
      setTimeout(() => {
        bulb?.sendRaw({ method: 'setPilot', params: { state: nextState } }, false).catch(() => {})
      }, 50)
    } catch (e) {
      log.warn(`Failed to toggle bulb at ${ip}:`, e)
    }
  }

  public async addBulbByIp(ip: string) {
    if (!ip) return

    if (this.appData.bulbs.some((b) => b.bulbIp === ip)) {
      log.info('Bulb at', ip, 'already exists, ignoring')
      this.sendToast({
        id: randomUUID(),
        message: 'toast.addDuplicate',
        type: 'info',
        autoDismiss: true
      })
      return
    }

    try {
      const res = await discover({ addr: ip, waitMs: 2500 })
      if (res.length > 0) {
        await this.connectBulb(res[0], ip)
        this.saveConfig()
        this.sendToast({
          id: randomUUID(),
          message: 'toast.addSuccess',
          type: 'success',
          autoDismiss: true
        })
      } else {
        // Add to known bulbs anyway so background auto-reconnector can keep probing it!
        this.appData.bulbs.push({ bulbIp: ip, bulbName: 'WiZ Bulb' })
        this.initKnownBulbs()
        this.saveConfig()
        this.sendStateToRenderer()
        this.sendToast({
          id: randomUUID(),
          message: 'toast.addSuccess',
          type: 'success',
          autoDismiss: true
        })
      }
    } catch (error) {
      log.error('Failed to add bulb by IP:', ip, error)
      this.sendToast({
        id: randomUUID(),
        message: 'toast.addFailed',
        type: 'error',
        autoDismiss: true
      })
    }
  }

  public async retryDiscovery() {
    this.discoveryFailed = false
    this.initKnownBulbs()
    for (const state of this.bulbStates.values()) {
      state.connectionStatus = 'connecting'
    }
    this.sendStateToRenderer()
    await this.discoverBulbs()
  }

  public async reconnectBulb(ip: string) {
    const state = this.bulbStates.get(ip)
    if (state) {
      state.connectionStatus = 'connecting'
      this.sendStateToRenderer()
    }

    try {
      const res = await discover({ addr: ip, waitMs: 2200 })
      if (res.length > 0) {
        await this.connectBulb(res[0], ip)
        this.saveConfig()
      } else {
        if (state) {
          state.connectionStatus = 'offline'
        }
      }
    } catch (error) {
      log.error('Failed to reconnect to bulb at', ip, ':', error)
      if (state) {
        state.connectionStatus = 'offline'
      }
    }
    this.sendStateToRenderer()
  }

  @needsViewUpdate('toggle active bulb')
  public async toggleBulb() {
    if (!this.activeBulbIp) return
    await this.toggleBulbByIp(this.activeBulbIp)
  }

  @needsViewUpdate('set brightness')
  public async setBrightness(dimming: number) {
    if (!this.activeBulbIp) return
    const state = this.getActiveBulb()
    if (!state) return

    let bulb = this.getActiveBulbInstance()
    if (!bulb) {
      bulb = new Bulb(this.activeBulbIp, { port: state.port || 38899 })
      this.bulbs.set(this.activeBulbIp, bulb)
    }

    try {
      state.dimming = dimming
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      bulb.sendRaw({ method: 'setPilot', params: { dimming } }, false).catch(() => {})
    } catch (e) {
      log.warn(`Failed to set brightness at ${this.activeBulbIp}:`, e)
    }
  }

  @needsViewUpdate('set bulb name')
  public setBulbName(name: string, ip?: string) {
    const targetIp = ip || this.activeBulbIp
    if (!targetIp) return

    const state = this.bulbStates.get(targetIp)
    if (state) {
      state.name = name
    }
    const saved = this.appData.bulbs.find((b) => b.bulbIp === targetIp)
    if (saved) {
      saved.bulbName = name
    }
    this.saveConfig()
  }

  @needsViewUpdate('set scene')
  public async setScene(sceneId: number) {
    if (!this.activeBulbIp) return
    const state = this.getActiveBulb()
    if (!state) return

    let bulb = this.getActiveBulbInstance()
    if (!bulb) {
      bulb = new Bulb(this.activeBulbIp, { port: state.port || 38899 })
      this.bulbs.set(this.activeBulbIp, bulb)
    }

    try {
      state.state = true
      state.sceneId = sceneId
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      bulb.sendRaw({ method: 'setPilot', params: { sceneId } }, false).catch(() => {})
      setTimeout(() => {
        bulb?.sendRaw({ method: 'setPilot', params: { sceneId } }, false).catch(() => {})
      }, 50)
    } catch (e) {
      log.warn('Failed to set scene at ' + this.activeBulbIp + ':', e)
    }
  }

  @needsViewUpdate('set custom color')
  public async setCustomColor(colorId: number) {
    if (!this.activeBulbIp) return
    const state = this.getActiveBulb()
    if (!state) return

    const color = this.appData.customColors.find((c) => c.id === colorId)
    if (!color) return

    let bulb = this.getActiveBulbInstance()
    if (!bulb) {
      bulb = new Bulb(this.activeBulbIp, { port: state.port || 38899 })
      this.bulbs.set(this.activeBulbIp, bulb)
    }

    try {
      state.state = true
      state.sceneId = colorId
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      const hex = color.hex.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) || 0
      const g = parseInt(hex.substring(2, 4), 16) || 0
      const b = parseInt(hex.substring(4, 6), 16) || 0

      bulb.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
      setTimeout(() => {
        bulb?.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
      }, 50)
    } catch (e) {
      log.warn('Failed to set custom color at ' + this.activeBulbIp + ':', e)
    }
  }

  @needsViewUpdate('toggle favorite color')
  public toggleFavoriteColor(colorId: number) {
    const exists = this.appData.favoriteColors.includes(colorId)
    if (exists) {
      this.appData.favoriteColors = this.appData.favoriteColors.filter((id) => id !== colorId)
    } else {
      this.appData.favoriteColors.push(colorId)
    }

    this.syncGlobalColorsToStates()
    this.saveConfig()
  }

  @needsViewUpdate('add custom color')
  public addCustomColor(colorName: string, colorHex: string) {
    const newId = this.getCustomColorNewId()
    this.appData.customColors.push({ id: newId, name: colorName, hex: colorHex })
    this.syncGlobalColorsToStates()
    this.saveConfig()
  }

  // Fast streaming sync for music visualizer (no disk logging or React store re-render on streaming frames)
  public syncBulbColor(r: number, g: number, b: number, dimming?: number, targetIp?: string) {
    const params: { r: number; g: number; b: number; dimming?: number } = {
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b)))
    }
    if (dimming !== undefined) {
      params.dimming = Math.max(10, Math.min(100, Math.round(dimming)))
    }

    if (targetIp === 'all' || !targetIp) {
      for (const bulb of this.bulbs.values()) {
        bulb.syncPilot(params).catch(() => {})
      }
    } else {
      const bulb = targetIp ? this.bulbs.get(targetIp) : this.getActiveBulbInstance()
      if (bulb) {
        bulb.syncPilot(params).catch(() => {})
      }
    }
  }

  @needsViewUpdate('edit custom color')
  public editCustomColor(colorId: number, colorName: string, colorHex: string) {
    const color = this.appData.customColors.find((c) => c.id === colorId)
    if (!color) return

    color.name = colorName
    color.hex = colorHex
    this.syncGlobalColorsToStates()
    this.saveConfig()
  }

  @needsViewUpdate('remove custom color')
  public removeCustomColor(colorId: number) {
    this.appData.customColors = this.appData.customColors.filter((c) => c.id !== colorId)
    this.appData.favoriteColors = this.appData.favoriteColors.filter((id) => id !== colorId)
    this.syncGlobalColorsToStates()
    this.saveConfig()
  }

  @needsViewUpdate('set favorite colors order')
  public setFavoriteColorsOrder(favoriteColors: number[]) {
    this.appData.favoriteColors = favoriteColors
    this.syncGlobalColorsToStates()
    this.saveConfig()
  }

  private getCustomColorNewId(): number {
    return (
      this.appData.customColors.reduce(
        (max, color) => (color.id > max ? color.id : max),
        MAX_DEFAULT_COLORS - 1
      ) + 1
    )
  }

  private syncGlobalColorsToStates() {
    for (const state of this.bulbStates.values()) {
      state.customColors = this.appData.customColors
      state.favoriteColors = this.appData.favoriteColors
    }
  }

  // --- Delete operations ---

  @needsViewUpdate('delete bulb')
  public deleteBulb(ip?: string) {
    const targetIp = ip || this.activeBulbIp
    if (!targetIp) return

    this.bulbs.delete(targetIp)
    this.bulbStates.delete(targetIp)
    this.appData.bulbs = this.appData.bulbs.filter((b) => b.bulbIp !== targetIp)

    if (this.activeBulbIp === targetIp) {
      this.activeBulbIp = this.bulbStates.keys().next().value ?? null
    }

    log.info('Bulb deleted:', targetIp)
    this.saveConfig()
  }

  @needsViewUpdate('delete profile')
  public deleteProfile() {
    this.bulbs.clear()
    this.bulbStates.clear()
    this.activeBulbIp = null

    log.info('Profile deleted')
    this.deleteConfig()
    this.appData = this.getConfigData()
    this.initKnownBulbs()
    this.init()
  }

  // --- Cleanup ---

  public endConnection() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.saveConfig()
    for (const [ip, bulb] of this.bulbs) {
      try {
        bulb.closeConnection()
        log.info('Closed connection for bulb at', ip)
      } catch {}
    }
  }
}

export default BulbManager
