import type { Agent } from "@mariozechner/pi-agent-core";
import type { AgentInterface, MessageRenderer } from "@mariozechner/pi-web-ui";
import { registerMessageRenderer } from "@mariozechner/pi-web-ui";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import "../components/OrbAnimation.js";
import { getSitegeistStorage } from "../storage/app-storage.js";

export interface TutorialPrompt {
	label: string;
	prompt: string;
}

export interface WelcomeMessage {
	role: "welcome";
	tutorials: TutorialPrompt[];
}

declare module "@mariozechner/pi-agent-core" {
	interface CustomAgentMessages {
		welcome: WelcomeMessage;
	}
}

@customElement("welcome-message")
export class WelcomeMessageElement extends LitElement {
	@property({ type: Array }) tutorials!: TutorialPrompt[];
	@property({ attribute: false }) agent!: Agent;
	@property({ attribute: false }) agentInterface!: AgentInterface;
	@property({ attribute: false }) message!: WelcomeMessage;

	// Rotating welcome tagline: full provider-neutral lines, no lock-in copy.
	// The driver badge below (if any) is the only place a configured local
	// provider is named.
	private taglines = [
		"your AI companion for the web",
		"your AI companion for research",
		"your AI companion for browsing",
		"your AI companion for getting things done",
		"your AI companion for the open web",
	];
	private currentTaglineIndex = 0;
	private intervalId?: number;

	@state() private driverLabel?: string;
	@state() private buildVersion?: string;

	protected createRenderRoot() {
		return this;
	}

	override connectedCallback() {
		super.connectedCallback();
		// Rotate tagline line every 4 seconds
		this.intervalId = window.setInterval(() => {
			this.currentTaglineIndex = (this.currentTaglineIndex + 1) % this.taglines.length;
			this.requestUpdate();
		}, 4000);
		void this.loadDriverBadge();
		try {
			this.buildVersion = chrome.runtime.getManifest().version;
		} catch {
			// Not running as an extension (dev preview); no version to show.
		}
	}

	/** Show "model · provider" only when a local custom provider is configured. */
	private async loadDriverBadge() {
		try {
			const providers = await getSitegeistStorage().customProviders.getAll();
			const preferred = providers.find((p) => p.name === "Ollama Local") ?? providers[0];
			const model = preferred?.models?.[0];
			if (model) {
				this.driverLabel = `${model.id} · ${preferred.name}`;
			}
		} catch {
			// No local provider configured; the badge simply stays hidden.
		}
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		if (this.intervalId) {
			clearInterval(this.intervalId);
		}
	}

	private async selectTutorial(prompt: string) {
		// Remove this welcome message. Agent.replaceMessages does not exist at
		// runtime (upstream removed the Agent mutators in pi-mono 0.65.0 in favor
		// of direct state assignment); assign the filtered list directly.
		const messages = this.agent.state.messages.filter((m) => m !== this.message);
		this.agent.state.messages = messages;

		// Send tutorial prompt
		await this.agentInterface.sendMessage(prompt);
	}

	override render(): TemplateResult {
		return html`
			<div class="welcome-orb-container my-8 flex flex-col items-center justify-center">
				<!-- Title and rotating tagline -->
				<div class="text-center mb-8">
					<h1 class="logo-breathe text-5xl font-bold mb-4">Sitegeist</h1>
					<p class="text-xl text-muted-foreground">
						${keyed(
							this.currentTaglineIndex,
							html`<span class="tagline-fade inline-block font-semibold text-foreground"
								>${this.taglines[this.currentTaglineIndex]}</span
							>`,
						)}
					</p>
					${
						this.driverLabel
							? html`<p class="mt-3">
								<span
									class="inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
									>${this.driverLabel}</span
								>
							</p>`
							: ""
					}
					${this.buildVersion ? html`<p class="mt-2 text-xs text-muted-foreground">v${this.buildVersion}</p>` : ""}
				</div>

				<!-- Three.js Orb Animation -->
				<div class="flex items-center justify-center -my-8 mb-4">
					<orb-animation></orb-animation>
				</div>

				<!-- Tutorial pills -->
				<div class="flex flex-wrap gap-3 justify-center max-w-lg px-6 mt-4">
					${this.tutorials.map(
						(tutorial, index) => html`
							<button
								class="tutorial-pill px-6 py-3 text-sm font-medium text-foreground rounded-full cursor-pointer"
								@click=${() => this.selectTutorial(tutorial.prompt)}
								style="animation-delay: ${index * 0.1}s;"
							>
								${tutorial.label}
							</button>
						`,
					)}
				</div>
			</div>
		`;
	}
}

export function createWelcomeRenderer(agent: Agent, agentInterface: AgentInterface): MessageRenderer<WelcomeMessage> {
	return {
		render: (message) => {
			// Only show if no conversation started yet
			const hasConversation = agent.state.messages.some((m) => m.role === "user" || m.role === "assistant");

			if (hasConversation) return html``;

			return html`<welcome-message
				.tutorials=${message.tutorials}
				.agent=${agent}
				.agentInterface=${agentInterface}
				.message=${message}
			></welcome-message>`;
		},
	};
}

export function registerWelcomeRenderer(agent: Agent, agentInterface: AgentInterface) {
	registerMessageRenderer("welcome", createWelcomeRenderer(agent, agentInterface));
}

export function createWelcomeMessage(tutorials: TutorialPrompt[]): WelcomeMessage {
	return { role: "welcome", tutorials };
}
