import dgram from "dgram";
import { Bulb } from "./bulb";
import { DEFAULT_DISCOVER_WAIT_MS, WIZ_BULB_LISTEN_PORT } from "./constants";
import { checkType } from "./type-checker";
import { getPilotResponseTemplate } from "./types";
import { getBroadcastAddresses, getRandomMac, ipAddress } from "./utils";

/**
 * Discovers WiZ bulbs on a local network using high-resilience UDP dual-payload multi-bursting.
 * Sends both standard registration broadcast pairing frames and getPilot status queries.
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
		let timeoutId: NodeJS.Timeout | null = null;
		let burst1: NodeJS.Timeout | null = null;
		let burst2: NodeJS.Timeout | null = null;

		const cleanup = () => {
			if (isDone) return;
			isDone = true;
			if (timeoutId) clearTimeout(timeoutId);
			if (burst1) clearTimeout(burst1);
			if (burst2) clearTimeout(burst2);
			try {
				client.off("message", listener);
				client.close();
			} catch {}
			resolve(bulbs);
		};

		const sendProbe = () => {
			if (isDone) return;
			// 1. WiZ discovery broadcast packet (registration)
			const regPayload = JSON.stringify({
				method: "registration",
				params: {
					phoneMac,
					register: true,
					phoneIp: localIp,
				},
			});
			// 2. WiZ direct pilot packet (getPilot)
			const pilotPayload = JSON.stringify({
				method: "getPilot",
				params: {},
			});

			for (const target of targets) {
				try {
					client.send(regPayload, port, target);
					client.send(pilotPayload, port, target);
				} catch {}
			}
		};

		const listener = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
			try {
				const response = JSON.parse(msg.toString());
				// Check for ANY valid WiZ protocol response
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
			// Multi-packet bursts defeat 2.4 GHz packet drop
			burst1 = setTimeout(sendProbe, 120);
			burst2 = setTimeout(sendProbe, 260);
		});

		timeoutId = setTimeout(() => {
			cleanup();
		}, waitMs);
	});
}
