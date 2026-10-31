import { CustomColor } from './customColor'

export type BulbConnectionStatus = 'connected' | 'connecting' | 'offline'

export interface BulbState {
  mac: string
  rssi: number
  src?: string
  state: boolean
  sceneId: number
  temp?: number
  speed?: number
  r?: number
  g?: number
  b?: number
  c?: number
  w?: number
  dimming?: number
  homeId: number
  roomId: number
  rgn: string
  moduleName: string
  fwVersion: string
  groupId: number
  ping: number
  ip: string
  port: number
  name: string
  customColors: CustomColor[]
  favoriteColors: Array<number>
  connectionStatus?: BulbConnectionStatus
}
