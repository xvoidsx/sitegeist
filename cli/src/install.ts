/**
 * Writes the native messaging host manifest for every Chromium browser present on
 * this machine, plus the launcher script the manifest points at. Idempotent; run
 * automatically by `sitegeist mcp` when the manifest is missing.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NATIVE_HOST_NAME } from "../../src/bridge/protocol.ts";

/** Stable id from the `key` in static/manifest.chrome.json. */
export const EXTENSION_ID = "bbkgpflnkggdfabgjhofdmdopgjopamc";

// Every Chromium user-data dir we know how to install the native host into,
// across all channels and forks. install() skips dirs that don't exist, so
// extra entries are free — a missing browser costs nothing, a missing entry
// costs that browser its bridge.
function browserDirs(): string[] {
	const home = homedir();
	if (process.platform === "darwin") {
		const base = join(home, "Library", "Application Support");
		return [
			join(base, "Google", "Chrome"),
			join(base, "Google", "Chrome Beta"),
			join(base, "Google", "Chrome Dev"),
			join(base, "Google", "Chrome Canary"),
			join(base, "Chromium"),
			join(base, "BraveSoftware", "Brave-Browser"),
			join(base, "BraveSoftware", "Brave-Browser-Beta"),
			join(base, "BraveSoftware", "Brave-Browser-Dev"),
			join(base, "BraveSoftware", "Brave-Browser-Nightly"),
			join(base, "BraveSoftware", "Brave-Origin"),
			join(base, "BraveSoftware", "Brave-Origin-Nightly"),
			join(base, "Microsoft Edge"),
			join(base, "Microsoft Edge Beta"),
			join(base, "Microsoft Edge Dev"),
			join(base, "Arc", "User Data"),
			join(base, "Vivaldi"),
			join(base, "Vivaldi Snapshot"),
			join(base, "com.operasoftware.Opera"),
			join(base, "Yandex"),
			join(base, "Helium"),
			join(base, "Helium", "User Data"),
			join(base, "Thorium"),
		];
	}
	if (process.platform === "linux") {
		const cfg = join(home, ".config");
		return [
			join(cfg, "google-chrome"),
			join(cfg, "google-chrome-beta"),
			join(cfg, "google-chrome-unstable"),
			join(cfg, "google-chrome-dev"),
			join(cfg, "google-chrome-canary"),
			join(cfg, "chromium"),
			join(cfg, "BraveSoftware", "Brave-Browser"),
			join(cfg, "BraveSoftware", "Brave-Browser-Beta"),
			join(cfg, "BraveSoftware", "Brave-Browser-Dev"),
			join(cfg, "BraveSoftware", "Brave-Browser-Nightly"),
			join(cfg, "BraveSoftware", "Brave-Origin"),
			join(cfg, "BraveSoftware", "Brave-Origin-Nightly"),
			join(cfg, "microsoft-edge"),
			join(cfg, "microsoft-edge-beta"),
			join(cfg, "microsoft-edge-dev"),
			join(cfg, "vivaldi"),
			join(cfg, "vivaldi-snapshot"),
			join(cfg, "opera"),
			join(cfg, "yandex-browser"),
			join(cfg, "yandex-browser-beta"),
			join(cfg, "net.imput.helium"),
			join(cfg, "helium"),
			join(cfg, "thorium"),
		];
	}
	return [];
}

function launcherPath(): string {
	return join(homedir(), ".config", "sitegeist", process.platform === "win32" ? "host.cmd" : "host");
}

function writeLauncher(): string {
	const path = launcherPath();
	mkdirSync(join(homedir(), ".config", "sitegeist"), { recursive: true, mode: 0o700 });
	const node = process.execPath;
	const script = process.argv[1];
	if (process.platform === "win32") {
		writeFileSync(path, `@echo off\r\n"${node}" "${script}" host %*\r\n`);
	} else {
		writeFileSync(path, `#!/bin/sh\nexec "${node}" "${script}" host "$@"\n`);
		chmodSync(path, 0o755);
	}
	return path;
}

function manifestFor(launcher: string): string {
	return `${JSON.stringify(
		{
			name: NATIVE_HOST_NAME,
			description: "sitegeist browser bridge",
			path: launcher,
			type: "stdio",
			allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
		},
		null,
		2,
	)}\n`;
}

export interface InstallResult {
	launcher: string;
	written: string[];
	skipped: string[];
}

export function install(options: { force?: boolean } = {}): InstallResult {
	const launcher = writeLauncher();
	const manifest = manifestFor(launcher);
	const written: string[] = [];
	const skipped: string[] = [];

	if (process.platform === "win32") {
		const dir = join(homedir(), ".config", "sitegeist");
		const file = join(dir, `${NATIVE_HOST_NAME}.json`);
		writeFileSync(file, manifest);
		for (const hive of [
			"Google\\Chrome",
			"Google\\Chrome Beta",
			"Google\\Chrome Dev",
			"Google\\Chrome Canary",
			"BraveSoftware\\Brave-Browser",
			"BraveSoftware\\Brave-Browser-Beta",
			"BraveSoftware\\Brave-Browser-Dev",
			"BraveSoftware\\Brave-Browser-Nightly",
			"BraveSoftware\\Brave-Origin",
			"Microsoft\\Edge",
			"Microsoft\\Edge Beta",
			"Microsoft\\Edge Dev",
			"Chromium",
		]) {
			const key = `HKCU\\Software\\${hive}\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;
			try {
				execFileSync("reg", ["add", key, "/ve", "/t", "REG_SZ", "/d", file, "/f"], { stdio: "ignore" });
				written.push(key);
			} catch {
				skipped.push(key);
			}
		}
		return { launcher, written, skipped };
	}

	for (const dir of browserDirs()) {
		if (!existsSync(dir)) continue;
		const hostsDir = join(dir, "NativeMessagingHosts");
		const file = join(hostsDir, `${NATIVE_HOST_NAME}.json`);
		if (!options.force && existsSync(file) && readFileSync(file, "utf8") === manifest) {
			skipped.push(file);
			continue;
		}
		mkdirSync(hostsDir, { recursive: true });
		writeFileSync(file, manifest);
		written.push(file);
	}
	return { launcher, written, skipped };
}

/** The CLI script the launcher execs, or undefined when the launcher is missing/unreadable. */
function launcherTarget(): string | undefined {
	try {
		const text = readFileSync(launcherPath(), "utf8");
		const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		// Launcher is `exec "<node>" "<script>" host ...` — the script is the second quoted token.
		return quoted[1];
	} catch {
		return undefined;
	}
}

/** True when at least one browser has a current manifest. */
export function isInstalled(): boolean {
	if (process.platform === "win32") return existsSync(join(homedir(), ".config", "sitegeist", `${NATIVE_HOST_NAME}.json`));
	const launcher = launcherPath();
	if (!existsSync(launcher)) return false;
	// A launcher whose target was deleted (repo removed, link broken) must not
	// report installed: the host can never spawn, and `sitegeist status` would
	// claim everything is fine while the bridge is dead.
	const target = launcherTarget();
	if (!target || !existsSync(target)) return false;
	const manifest = manifestFor(launcher);
	return browserDirs().some((dir) => {
		const file = join(dir, "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
		return existsSync(file) && readFileSync(file, "utf8") === manifest;
	});
}
