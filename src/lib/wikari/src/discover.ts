import dgram from "dgram";
import { Bulb } from "./bulb";
import { DEFAULT_DISCOVER_WAIT_MS, WIZ_BULB_LISTEN_PORT } from "./constants";
import { checkType } from "./type-checker";
import { getPilotResponseTemplate } from "./types";
import { getBroadcastAddresses, getRandomMac, ipAddress } from "./utils";

/**
 * Discovers WiZ bulbs on a local network using high-resilience UDP dual-payload multi-bursting.
 * Spaced packet bursts penetrate 802.11 DTIM power-save sleep on weak RF links.
 */
export async function discover({
	addr,
	port = WIZ_BULB_LISTEN_PORT,
	waitMs = DEFAULT_DISCOVER_WAIT_MS,
	extraTargets = [],
}: {
	addr?: string;
	port?: number;
	waitMs?: number;
	extraTargets?: string[];
} = {}): Promise<Bulb[]> {
	const effectiveWaitMs = Math.max(waitMs, 2200);
	const client = dgram.createSocket({ type: "udp4", reuseAddr: true });
	const bulbs: Bulb[] = [];
	const localIp = ipAddress() || "192.168.20.4";
	const phoneMac = getRandomMac();

	const targets: string[] = [];
	if (addr) {
		targets.push(addr);
	} else {
		for (const bc of getBroadcastAddresses()) {
			if (!targets.includes(bc)) targets.push(bc);
		}
		if (!targets.includes("255.255.255.255")) {
			targets.push("255.255.255.255");
		}
	}

	if (extraTargets && extraTargets.length > 0) {
		for (const et of extraTargets) {
			if (!targets.includes(et)) targets.push(et);
		}
	}

	return new Promise<Bulb[]>((resolve) => {
		let isDone = false;
		const timers: NodeJS.Timeout[] = [];

		const cleanup = () => {
			if (isDone) return;
			isDone = true;
			timers.forEach((t) => clearTimeout(t));
			try {
				client.off("message", listener);
				client.close();
			} catch {}
			resolve(bulbs);
		};

		const sendProbe = () => {
			if (isDone) return;
			const regPayload = JSON.stringify({
				method: "registration",
				params: {
					phoneMac,
					register: true,
					phoneIp: localIp,
				},
			});
			const pilotPayload = JSON.stringify({
				method: "getPilot",
				params: {},
			});

			for (let i = 0; i < targets.length; i++) {
				const target = targets[i];
				try {
					// Prioritize getPilot (instant status query)
					client.send(pilotPayload, port, target);
					// Send registration slightly delayed for unicast to prevent packet collision on ESP32
					if (targets.length === 1) {
						timers.push(
							setTimeout(() => {
								if (!isDone) {
									try { client.send(regPayload, port, target); } catch {}
								}
							}, 40)
						);
					} else {
						client.send(regPayload, port, target);
					}
				} catch {}
			}
		};

		const listener = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
			try {
				const response = JSON.parse(msg.toString());
				const isWizResponse =
					(response && response.result && (response.result.mac !== undefined || response.result.state !== undefined || response.result.success !== undefined)) ||
					(response && response.method && ["getPilot", "registration", "getSystemConfig", "syncPilot"].includes(response.method)) ||
					checkType(getPilotResponseTemplate, response);

				if (isWizResponse) {
					if (!bulbs.some((b) => b.address === rinfo.address)) {
						const mac = response?.result?.mac || response?.params?.mac || undefined;
						bulbs.push(new Bulb(rinfo.address, { port, macIdentifier: mac }));
						if (addr && rinfo.address === addr) {
							cleanup();
						}
					}
				}
			} catch {}
		};

		client.on("error", () => {
			cleanup();
		});

		client.on("message", listener);

		client.on("listening", function () {
			try {
				client.setBroadcast(true);
			} catch {}
		});

		client.bind(() => {
			sendProbe();
			// Multi-packet bursts spaced to penetrate 802.11 DTIM power-save sleep
			timers.push(setTimeout(sendProbe, 300));
			timers.push(setTimeout(sendProbe, 750));
			timers.push(setTimeout(sendProbe, 1400));
		});

		timers.push(
			setTimeout(() => {
				cleanup();
			}, effectiveWaitMs)
		);
	});
}
