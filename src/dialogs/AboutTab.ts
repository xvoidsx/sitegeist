import { i18n } from "@mariozechner/mini-lit/dist/i18n.js";
import { SettingsTab } from "@mariozechner/pi-web-ui";
import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../utils/i18n-extension.js";

/** Semver-ish newer-than check ("1.2.10" > "1.2.9"). */
function isNewerVersion(latest: string, current: string): boolean {
	const latestParts = latest.split(".").map(Number);
	const currentParts = current.split(".").map(Number);
	for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
		const l = latestParts[i] || 0;
		const c = currentParts[i] || 0;
		if (l > c) return true;
		if (l < c) return false;
	}
	return false;
}

@customElement("about-tab")
export class AboutTab extends SettingsTab {
	@state() private updateAvailable = false;
	@state() private latestVersion = "";
	@state() private checking = true;
	@state() private error = false;

	getTabName(): string {
		return i18n("About");
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.checkForUpdates();
	}

	// xvoidsx fork: check our own releases, not upstream's version.json
	// (which reports 0.6.x and whose Update button installed upstream over
	// this fork). The fork has no releases yet, so a 404 means "nothing
	// newer published" — show up to date, never a false update.
	private async checkForUpdates() {
		try {
			const response = await fetch("https://api.github.com/repos/xvoidsx/sitegeist/releases/latest", {
				cache: "no-cache",
			});
			const currentVersion = chrome.runtime.getManifest().version;
			if (!response.ok) {
				this.updateAvailable = false;
				this.checking = false;
				return;
			}
			const data = await response.json();
			const latestVersion = String(data.tag_name || "").replace(/^v/, "");
			this.latestVersion = latestVersion;
			// Proper newer-than comparison: a local build ahead of the latest
			// release (normal during development) must not show as an update.
			this.updateAvailable = latestVersion !== "" && isNewerVersion(latestVersion, currentVersion);
			this.checking = false;
		} catch (err) {
			console.warn("[AboutTab] Failed to check for updates:", err);
			this.error = true;
			this.checking = false;
		}
	}

	private openUpdatePage() {
		window.open("https://github.com/xvoidsx/sitegeist/releases", "_blank");
	}

	render(): TemplateResult {
		// Get version from the manifest
		const version = chrome.runtime.getManifest().version;

		return html`
			<div class="flex flex-col gap-4">
				<div class="space-y-2">
					<h3 class="text-lg font-semibold text-foreground">Sitegeist</h3>
					<p class="text-sm text-muted-foreground">${i18n("AI-powered browser extension for web navigation and interaction")}</p>
				</div>

				<div class="space-y-1">
					<div class="text-sm">
						<span class="font-medium text-foreground">${i18n("Version:")}</span>
						<span class="text-muted-foreground ml-2">${version}</span>
					</div>
				</div>

				${
					this.checking
						? html`
								<div class="text-xs text-muted-foreground">
									${i18n("Checking for updates...")}
								</div>
							`
						: this.updateAvailable
							? html`
									<div class="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
										<div class="flex items-start justify-between gap-3">
											<div class="flex-1">
												<div class="text-sm font-medium text-foreground mb-1">
													${i18n("Update Available")}
												</div>
												<div class="text-xs text-muted-foreground">
													${i18n("A new version ({version}) is available").replace("{version}", this.latestVersion)}
												</div>
											</div>
											<button
												@click=${this.openUpdatePage}
												class="px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-foreground transition-colors"
											>
												${i18n("Update")}
											</button>
										</div>
									</div>
								`
							: !this.error
								? html`
										<div class="text-xs text-green-600 dark:text-green-400">
											✓ ${i18n("You're up to date")}
										</div>
									`
								: ""
				}

				<div class="pt-4 space-y-2">
					<div class="text-xs text-muted-foreground space-x-3">
						<a href="https://github.com/xvoidsx/sitegeist" target="_blank" class="text-primary hover:underline">${i18n("Website")}</a>
					</div>
				</div>
			</div>
		`;
	}
}
