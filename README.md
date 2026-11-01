# WiZ APP 💡

> **Advanced Desktop App for controlling and synchronizing WiZ Smart Lighting**

Based on the foundational work by [**noturbob/wiz-pc**](https://github.com/noturbob/wiz-pc), this upgraded edition includes comprehensive multi-bulb synchronous controls, live ambient screen color & music reactive synchronization, hardware diagnostics, and a fault-tolerant discovery/reconnect engine.

---

## 🌟 Key Features

* **Multi-Bulb Synchronous Control ("Change Both Lights Together")**
  * Apply scenes, dynamic modes, RGB colors, color temperature, and brightness simultaneously across all connected WiZ bulbs with a single click.
* **Music & Screen Sync (Ambilight Mode)**
  * **Screen Ambilight**: Samples your monitor in real-time to match your lights to movies, games, or display content.
  * **Audio Reactivity**: Dynamically modulates light intensity and brightness based on real-time microphone or system audio volume.
* **Information & Diagnostics Card View**
  * Displays real-time hardware status, firmware version, IP address, MAC address, RSSI signal strength, Home ID, Room ID, and connection health for every bulb in the network.
* **Self-Healing Auto-Reconnect Engine**
  * Dual-payload handshake (`method: registration` + `method: getPilot`) compatible with firmware v1.35.0+.
  * Dynamic ephemeral UDP socket binding (port `0`) to eliminate Windows Defender Firewall blocking and port contention.
  * Multi-burst UDP retransmission (at 0ms, 200ms, and 500ms) to overcome weak 2.4 GHz Wi-Fi packet drops and bulb modem-sleep (DTIM).
  * Automatic DHCP IP migration detection and automatic recovery.
* **Favorites & Custom Scenes**
  * Pin your favorite scenes and create custom RGB colors with fast switching.
* **System Tray Integration**
  * Minimizes to Windows System Tray with quick power toggle and background persistence.

---

## 📥 Download Executable

You can download the Windows installer (`wiz_app-3.0.0-setup.exe`) directly from the [**Releases**](https://github.com/mathewsjoarnold/MJA-CREATIONS/releases) page of this repository.

---

## 🛠️ Building from Source

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* `npm` or `pnpm`

### Installation & Build
```bash
# 1. Clone the repository
git clone https://github.com/mathewsjoarnold/MJA-CREATIONS.git
cd MJA-CREATIONS

# 2. Install dependencies
npm install

# 3. Run development mode
npm run dev

# 4. Build Windows installer (.exe)
npm run build:win

# 5. Build unpacked distribution
npm run build:unpack
```
The compiled installer will be located in the `dist/` directory.

---

## 🙏 Credits & Acknowledgments

* **[noturbob/wiz-pc](https://github.com/noturbob/wiz-pc)** — Special thanks to [noturbob](https://github.com/noturbob) for providing the initial WiZ PC desktop project structure and foundation.
* **[MatiasTK/WizAPP](https://github.com/MatiasTK/WizAPP)** — Base Vite + React + Tailwind implementation.

---

## 📄 License & Disclaimer

This project is open-source and independent. It is not officially affiliated with or endorsed by WiZ Connected or Signify.
