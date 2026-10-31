import dgram from "dgram";
import { Bulb } from "./bulb";
import { DEFAULT_DISCOVER_WAIT_MS, WIZ_BULB_LISTEN_PORT } from "./constants";
import { checkType } from "./type-checker";
import { GetPilotMsg, getPilotResponseTemplate } from "./types";
import { getBroadcastAddresses } from "./utils";

/**
 * Discovers bulbs on a network using high-resilience UDP multi-bursting.
 */
export async function discover({
	addr,
	port = WIZ_BULB_LISTEN_PORT,
	waitMs = DEFAULT_DISCOVER_WAIT_MS,
}: {
	addr?: string;
	port?: number;
	waitMs?: number;
} = {}): Promise<Bulb[]> {
	const client = dgram.createSocket("udp4");
	const bulbs: Bulb[] = [];
	const message: GetPilotMsg = {
		method: "getPilot",
		params: {},
	};

	const targets = addr ? [addr] : getBroadcastAddresses();

	if (targets.length === 0 && !addr) {
		targets.push("255.255.255.255");
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
			for (const target of targets) {
				try {
					client.send(JSON.stringify(message), port, target);
				} catch {}
			}
		};

		const listener = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
			try {
				const response = JSON.parse(msg.toString());
				if (checkType(getPilotResponseTemplate, response)) {
					if (!bulbs.some((b) => b.address === rinfo.address)) {
						bulbs.push(new Bulb(rinfo.address, { port }));
						// When probing a specific IP, resolve early as soon as it responds
						if (addr && rinfo.address === addr) {
							cleanup();
						}
					}
				}
			} catch {}
		};

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
