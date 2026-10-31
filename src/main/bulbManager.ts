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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

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
      if (!entry.mac) {
        if (entry.bulbIp === '192.168.20.6') entry.mac = 'cc40855ddf56'
        else if (entry.bulbIp === '192.168.20.7') entry.mac = 'd8a0118e4112'
      }
      if (!this.bulbStates.has(entry.bulbIp)) {
        this.bulbStates.set(entry.bulbIp, {
          ip: entry.bulbIp,
          name: entry.bulbName || 'WiZ Bulb',
          port: 38899,
          mac: entry.mac || '',
          rssi: 0,
          state: false,
          sceneId: 0,
          homeId: 0,
          roomId: 0,
          rgn: '',
          moduleName: entry.moduleName || 'WiZ Bulb',
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
        { bulbIp: '192.168.20.6', bulbName: 'ESP25_SHRGB_01', mac: 'cc40855ddf56', moduleName: 'ESP25_SHRGB_01' },
        { bulbIp: '192.168.20.7', bulbName: 'ESP01_SHRGB1C_31', mac: 'd8a0118e4112', moduleName: 'ESP01_SHRGB1C_31' }
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

    // Update names, mac, and moduleName from connected bulbs
    for (const [ip, state] of this.bulbStates) {
      if (ip && state) {
        const existing = bulbMap.get(ip)
        bulbMap.set(ip, {
          bulbIp: ip,
          bulbName: state.name || existing?.bulbName || 'WiZ Bulb',
          mac: state.mac || existing?.mac || '',
          moduleName: state.moduleName || existing?.moduleName || 'WiZ Bulb'
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

    // Phase 2: Network Broadcast & Subnet Sweep if ANY saved bulb is missing or new setup
    const missingBulbs = savedIps.filter((ip) => {
      const state = this.bulbStates.get(ip)
      return !state || state.connectionStatus !== 'connected'
    })

    if (missingBulbs.length > 0 || (savedIps.length === 0 && this.bulbs.size === 0)) {
      log.info(`Phase 2: ${missingBulbs.length} bulb(s) missing after unicast probe. Running broadcast/subnet discovery...`)
      try {
        const sweepResults = await this.sweepNetworkForBulbs()
        for (const bulb of sweepResults) {
          await this.handleDiscoveredBulb(bulb)
        }
      } catch (err) {
        log.warn('Phase 2 broadcast/subnet discovery error:', err)
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

    // Assign active bulb: prefer connected bulbs over offline bulbs!
    const activeState = this.activeBulbIp ? this.bulbStates.get(this.activeBulbIp) : null
    if (!activeState || activeState.connectionStatus !== 'connected') {
      const firstConnected = Array.from(this.bulbStates.values()).find(
        (s) => s.connectionStatus === 'connected'
      )
      if (firstConnected) {
        this.activeBulbIp = firstConnected.ip
      } else if (!this.activeBulbIp) {
        this.activeBulbIp = this.appData.activeBulbIp || this.bulbStates.keys().next().value || null
      }
    }

    this.saveConfig()
    this.sendStateToRenderer()
  }

  // --- Background Auto-Reconnect Daemon & Network Probing ---

  /**
   * Discovers all WiZ bulbs across the local network by combining broadcast
   * and proactive subnet scanning around known IPs to mitigate router broadcast filtering.
   */
  public async sweepNetworkForBulbs(): Promise<Bulb[]> {
    const extraTargets: string[] = []
    const prefixes = new Set<string>()

    for (const b of this.appData.bulbs) {
      const parts = b.bulbIp.split('.')
      if (parts.length === 4) {
        prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}.`)
      }
    }
    if (prefixes.size === 0) {
      prefixes.add('192.168.20.')
    }

    for (const prefix of prefixes) {
      // Proactively probe common DHCP lease IPs
      for (let i = 2; i <= 35; i++) {
        extraTargets.push(`${prefix}${i}`)
      }
    }

    try {
      return await discover({ waitMs: 2200, extraTargets })
    } catch {
      return []
    }
  }

  /**
   * Resolves a discovered bulb against saved bulbs using hardware MAC address
   * to automatically handle dynamic DHCP IP reassignments.
   */
  public async handleDiscoveredBulb(bulb: Bulb) {
    const discoveredIp = bulb.address
    let mac = bulb.macIdentifier || ''

    if (!mac) {
      try {
        const pilot = await bulb.getPilot()
        if (pilot?.result?.mac) {
          mac = pilot.result.mac
        }
      } catch {}
    }

    // 1. Check if this bulb matches an existing saved bulb by MAC address
    const matchingSavedByMac = mac
      ? this.appData.bulbs.find(
          (b) => b.mac && b.mac.toLowerCase() === mac.toLowerCase()
        )
      : null

    if (matchingSavedByMac) {
      if (matchingSavedByMac.bulbIp !== discoveredIp) {
        const oldIp = matchingSavedByMac.bulbIp
        log.info(
          `[Auto-Reconnect] DHCP IP MIGRATION DETECTED! Bulb "${matchingSavedByMac.bulbName}" (MAC ${mac}) moved from ${oldIp} -> ${discoveredIp}`
        )
        this.bulbs.delete(oldIp)
        this.bulbStates.delete(oldIp)

        matchingSavedByMac.bulbIp = discoveredIp
        if (this.activeBulbIp === oldIp) {
          this.activeBulbIp = discoveredIp
        }
      }

      await this.connectBulb(bulb, discoveredIp)
      this.saveConfig()
      this.sendStateToRenderer()
      return
    }

    // 2. Check if this bulb matches by IP
    const matchingSavedByIp = this.appData.bulbs.find((b) => b.bulbIp === discoveredIp)
    if (matchingSavedByIp) {
      const existingState = this.bulbStates.get(discoveredIp)
      if (!existingState || existingState.connectionStatus !== 'connected') {
        await this.connectBulb(bulb, discoveredIp)
        this.saveConfig()
        this.sendStateToRenderer()
      }
    }
  }

  /**
   * Background health monitor for connected bulbs. Detects power switch off or Wi-Fi drops.
   */
  private async performHealthCheck() {
    for (const [ip, bulb] of this.bulbs) {
      const state = this.bulbStates.get(ip)
      if (!state || state.connectionStatus !== 'connected') continue

      try {
        const pilot = await bulb.getPilot()
        if (pilot && pilot.result) {
          state.state = pilot.result.state ?? state.state
          state.dimming = pilot.result.dimming ?? state.dimming
          state.rssi = pilot.result.rssi ?? state.rssi
        }
      } catch {
        // Missed pilot check; verify with quick unicast probe before declaring offline
        try {
          const res = await discover({ addr: ip, waitMs: 1200 })
          if (res.length === 0) {
            log.warn(`Bulb at ${ip} stopped responding. Transitioning to offline for auto-reconnect.`)
            state.connectionStatus = 'offline'
            this.sendStateToRenderer()
          }
        } catch {
          state.connectionStatus = 'offline'
          this.sendStateToRenderer()
        }
      }
    }
  }

  /**
   * Continuous self-healing auto-reconnection daemon.
   * Uses non-overlapping recursive setTimeout to guarantee safe socket execution on Windows.
   */
  private startAutoReconnectDaemon() {
    if (this.reconnectTimer) return

    let cycleCount = 0

    const runReconnectionCycle = async () => {
      try {
        const savedEntries = this.appData.bulbs
        const disconnectedBulbs = savedEntries.filter((entry) => {
          const state = this.bulbStates.get(entry.bulbIp)
          return !state || state.connectionStatus !== 'connected'
        })

        if (disconnectedBulbs.length > 0) {
          cycleCount++

          // Step 1: Unicast multi-burst probe to known IPs
          await Promise.allSettled(
            disconnectedBulbs.map(async (entry) => {
              try {
                const res = await discover({ addr: entry.bulbIp, waitMs: 1600 })
                if (res.length > 0) {
                  await this.connectBulb(res[0], entry.bulbIp)
                  log.info(`[Auto-Reconnect] Reconnected bulb at ${entry.bulbIp} (${entry.bulbName})`)
                  this.saveConfig()
                  this.sendStateToRenderer()
                }
              } catch (err) {
                log.warn(`[Auto-Reconnect] Unicast probe error for ${entry.bulbIp}:`, err)
              }
            })
          )

          // Step 2: Check if any bulbs are STILL disconnected
          const stillDisconnected = savedEntries.filter((entry) => {
            const state = this.bulbStates.get(entry.bulbIp)
            return !state || state.connectionStatus !== 'connected'
          })

          // Step 3: Every 3rd cycle (~10s) or on initial cycle, perform full broadcast + subnet sweep
          if (stillDisconnected.length > 0 && (cycleCount % 3 === 0 || cycleCount === 1)) {
            try {
              const discoveredBulbs = await this.sweepNetworkForBulbs()
              for (const discovered of discoveredBulbs) {
                await this.handleDiscoveredBulb(discovered)
              }
            } catch (err) {
              log.warn('[Auto-Reconnect] Network sweep error:', err)
            }
          }
        } else {
          // All bulbs are connected: run gentle heartbeat health check every ~10s
          cycleCount++
          if (cycleCount % 3 === 0) {
            await this.performHealthCheck()
          }
        }
      } catch (e) {
        log.error('[Auto-Reconnect] Cycle error:', e)
      } finally {
        // Continuous, self-scheduling 3.5s delay
        this.reconnectTimer = setTimeout(runReconnectionCycle, 3500)
      }
    }

    this.reconnectTimer = setTimeout(runReconnectionCycle, 1500)
  }

  private async connectBulb(bulb: Bulb, ip: string) {
    try {
      const state = await this.setUpSingleBulb(bulb, ip)
      this.bulbs.set(ip, bulb)
      this.bulbStates.set(ip, state)

      const active = this.activeBulbIp ? this.bulbStates.get(this.activeBulbIp) : null
      if (!this.activeBulbIp || !active || active.connectionStatus !== 'connected') {
        this.activeBulbIp = ip
      }

      log.info('Connected to bulb at', ip, '- Name:', state.name)
      this.sendStateToRenderer()
    } catch (error) {
      log.error('Failed to set up bulb at', ip, ':', error)
    }
  }

  private async setUpSingleBulb(bulb: Bulb, ip: string): Promise<BulbState> {
    let pilot: any = {
      state: true,
      sceneId: 0,
      dimming: 100
    }

    try {
      const pilotResponse = await bulb.getPilot()
      if (pilotResponse && pilotResponse.result) {
        pilot = pilotResponse.result
      }
    } catch (e) {
      log.warn(`Could not fetch live pilot for ${ip}, using default/cached state:`, e)
      const existing = this.bulbStates.get(ip)
      if (existing) {
        pilot = { ...existing }
      }
    }

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
    if (savedEntry) {
      if (configResult.mac) savedEntry.mac = configResult.mac
      if (configResult.moduleName) savedEntry.moduleName = configResult.moduleName
    }
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
      log.info(`[Manual Reconnect] Probing bulb at ${ip}...`)
      // 1. Direct unicast probe
      const res = await discover({ addr: ip, waitMs: 2000 })
      if (res.length > 0) {
        await this.connectBulb(res[0], ip)
        this.saveConfig()
        this.sendStateToRenderer()
        return
      }

      // 2. Unicast didn't respond: immediately sweep subnet to detect if DHCP IP changed!
      log.info(`[Manual Reconnect] ${ip} did not respond directly. Sweeping subnet to check IP migration...`)
      const sweep = await this.sweepNetworkForBulbs()
      for (const bulb of sweep) {
        await this.handleDiscoveredBulb(bulb)
      }

      const updatedState = this.bulbStates.get(ip)
      if (updatedState && updatedState.connectionStatus === 'connected') {
        log.info(`[Manual Reconnect] Successfully reconnected via network sweep!`)
        return
      }

      // If still offline, update status (auto-reconnector will keep trying continuously)
      if (state) {
        state.connectionStatus = 'offline'
      }
    } catch (error) {
      log.error('Failed to reconnect to bulb at', ip, ':', error)
      if (state) {
        state.connectionStatus = 'offline'
      }
    }
    this.sendStateToRenderer()
  }

  @needsViewUpdate('toggle bulb')
  public async toggleBulb(targetIp?: string) {
    if (targetIp === 'all') {
      const anyOn = Array.from(this.bulbStates.values()).some((s) => s.state)
      const targetState = !anyOn

      for (const [ip, state] of this.bulbStates) {
        let bulb = this.bulbs.get(ip)
        if (!bulb) {
          bulb = new Bulb(ip, { port: state.port || 38899 })
          this.bulbs.set(ip, bulb)
        }
        try {
          state.state = targetState
          state.connectionStatus = 'connected'
          bulb.sendRaw({ method: 'setPilot', params: { state: targetState } }, false).catch(() => {})
          setTimeout(() => {
            bulb?.sendRaw({ method: 'setPilot', params: { state: targetState } }, false).catch(() => {})
          }, 50)
        } catch (e) {
          log.warn(`Failed to toggle bulb at ${ip}:`, e)
        }
      }
      this.sendStateToRenderer()
      return
    }

    const ip = targetIp || this.activeBulbIp
    if (!ip) return
    await this.toggleBulbByIp(ip)
  }

  @needsViewUpdate('set brightness')
  public async setBrightness(dimming: number, targetIp?: string) {
    if (targetIp === 'all') {
      for (const [ip, state] of this.bulbStates) {
        let bulb = this.bulbs.get(ip)
        if (!bulb) {
          bulb = new Bulb(ip, { port: state.port || 38899 })
          this.bulbs.set(ip, bulb)
        }
        try {
          state.dimming = dimming
          state.connectionStatus = 'connected'
          bulb.sendRaw({ method: 'setPilot', params: { dimming } }, false).catch(() => {})
        } catch (e) {
          log.warn(`Failed to set brightness at ${ip}:`, e)
        }
      }
      this.sendStateToRenderer()
      return
    }

    const ip = targetIp || this.activeBulbIp
    if (!ip) return
    const state = this.bulbStates.get(ip)
    if (!state) return

    let bulb = this.bulbs.get(ip)
    if (!bulb) {
      bulb = new Bulb(ip, { port: state.port || 38899 })
      this.bulbs.set(ip, bulb)
    }

    try {
      state.dimming = dimming
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      bulb.sendRaw({ method: 'setPilot', params: { dimming } }, false).catch(() => {})
    } catch (e) {
      log.warn(`Failed to set brightness at ${ip}:`, e)
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
  public async setScene(sceneId: number, targetIp?: string) {
    if (targetIp === 'all') {
      for (const [ip, state] of this.bulbStates) {
        let bulb = this.bulbs.get(ip)
        if (!bulb) {
          bulb = new Bulb(ip, { port: state.port || 38899 })
          this.bulbs.set(ip, bulb)
        }
        try {
          state.state = true
          state.sceneId = sceneId
          state.connectionStatus = 'connected'
          bulb.sendRaw({ method: 'setPilot', params: { sceneId } }, false).catch(() => {})
          setTimeout(() => {
            bulb?.sendRaw({ method: 'setPilot', params: { sceneId } }, false).catch(() => {})
          }, 50)
        } catch (e) {
          log.warn(`Failed to set scene at ${ip}:`, e)
        }
      }
      this.sendStateToRenderer()
      return
    }

    const ip = targetIp || this.activeBulbIp
    if (!ip) return
    const state = this.bulbStates.get(ip)
    if (!state) return

    let bulb = this.bulbs.get(ip)
    if (!bulb) {
      bulb = new Bulb(ip, { port: state.port || 38899 })
      this.bulbs.set(ip, bulb)
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
      log.warn('Failed to set scene at ' + ip + ':', e)
    }
  }

  @needsViewUpdate('set custom color')
  public async setCustomColor(colorId: number, targetIp?: string) {
    const color = this.appData.customColors.find((c) => c.id === colorId)
    if (!color) return

    const hex = color.hex.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0

    if (targetIp === 'all') {
      for (const [ip, state] of this.bulbStates) {
        let bulb = this.bulbs.get(ip)
        if (!bulb) {
          bulb = new Bulb(ip, { port: state.port || 38899 })
          this.bulbs.set(ip, bulb)
        }
        try {
          state.state = true
          state.sceneId = colorId
          state.connectionStatus = 'connected'
          bulb.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
          setTimeout(() => {
            bulb?.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
          }, 50)
        } catch (e) {
          log.warn(`Failed to set custom color at ${ip}:`, e)
        }
      }
      this.sendStateToRenderer()
      return
    }

    const ip = targetIp || this.activeBulbIp
    if (!ip) return
    const state = this.bulbStates.get(ip)
    if (!state) return

    let bulb = this.bulbs.get(ip)
    if (!bulb) {
      bulb = new Bulb(ip, { port: state.port || 38899 })
      this.bulbs.set(ip, bulb)
    }

    try {
      state.state = true
      state.sceneId = colorId
      state.connectionStatus = 'connected'
      this.sendStateToRenderer()

      bulb.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
      setTimeout(() => {
        bulb?.sendRaw({ method: 'setPilot', params: { r, g, b } }, false).catch(() => {})
      }, 50)
    } catch (e) {
      log.warn('Failed to set custom color at ' + ip + ':', e)
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
      clearTimeout(this.reconnectTimer)
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
