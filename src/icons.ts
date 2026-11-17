import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { html, render } from "lit";
import { ArrowLeft, Download } from "lucide";

// nightshadeNeon palette (see wired/waybar/style.css in navi)
const NEON_CYAN = "#00ffff";
const NEON_MAGENTA = "#ff10f0";
const NEON_DARK = "#0a050b";

interface IconSize {
	size: number;
	name: string;
}

const ICON_SIZES: IconSize[] = [
	{ size: 16, name: "icon-16.png" },
	{ size: 48, name: "icon-48.png" },
	{ size: 128, name: "icon-128.png" },
];

/** Classic ghost silhouette: domed top, straight sides, scalloped hem. */
function traceGhostPath(ctx: CanvasRenderingContext2D, s: number) {
	const x0 = s * 0.1875;
	const x1 = s * 0.8125;
	const top = s * 0.137;
	const midY = s * 0.41;
	const hemY = s * 0.781;
	const r = (x1 - x0) / 8;

	ctx.beginPath();
	ctx.moveTo(x0, hemY);
	ctx.lineTo(x0, midY);
	// Dome: left point over the top to the right point
	ctx.ellipse(s / 2, midY, (x1 - x0) / 2, midY - top, 0, Math.PI, 0);
	ctx.lineTo(x1, hemY);
	// Scalloped hem: four bumps, right to left
	for (let i = 0; i < 4; i++) {
		const cx = x1 - r - i * 2 * r;
		ctx.arc(cx, hemY, r, 0, Math.PI, false);
	}
	ctx.closePath();
}

function drawEyes(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = NEON_DARK;
	for (const ex of [s * 0.383, s * 0.617]) {
		ctx.beginPath();
		ctx.ellipse(ex, s * 0.449, s * 0.051, s * 0.074, 0, 0, Math.PI * 2);
		ctx.fill();
	}
}

/** Draw the gradient ghost (cyan -> magenta, dark eyes, magenta glow). */
function drawGhost(ctx: CanvasRenderingContext2D, s: number) {
	const top = s * 0.137;
	const hemY = s * 0.781;
	const r = s * 0.078125;

	const grad = ctx.createLinearGradient(0, top, 0, hemY + r);
	grad.addColorStop(0, NEON_CYAN);
	grad.addColorStop(1, NEON_MAGENTA);

	// Glow pass: same shape, blurred magenta shadow
	ctx.save();
	ctx.shadowColor = NEON_MAGENTA;
	ctx.shadowBlur = s * 0.05;
	traceGhostPath(ctx, s);
	ctx.fillStyle = grad;
	ctx.fill();
	ctx.restore();

	// Body pass: sharp gradient fill
	traceGhostPath(ctx, s);
	ctx.fillStyle = grad;
	ctx.fill();

	drawEyes(ctx, s);
}

function captureGhostAsImage(size: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		try {
			// Draw at 2x then downscale for clean edges at small sizes
			const scale = 2;
			const big = document.createElement("canvas");
			big.width = size * scale;
			big.height = size * scale;
			const bigCtx = big.getContext("2d");
			if (!bigCtx) {
				throw new Error("Failed to get 2D context");
			}
			drawGhost(bigCtx, size * scale);

			const outputCanvas = document.createElement("canvas");
			outputCanvas.width = size;
			outputCanvas.height = size;
			const ctx = outputCanvas.getContext("2d");
			if (!ctx) {
				throw new Error("Failed to get 2D context");
			}
			ctx.drawImage(big, 0, 0, size, size);

			outputCanvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error("Failed to create blob from canvas"));
					}
				},
				"image/png",
				1.0,
			);
		} catch (error) {
			reject(error);
		}
	});
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

async function generateIcon(iconSize: IconSize) {
	const statusEl = document.getElementById(`status-${iconSize.size}`);
	const downloadBtnWrapper = document.getElementById(`download-${iconSize.size}`);
	const downloadBtn = downloadBtnWrapper?.querySelector("button");
	const previewEl = document.getElementById(`preview-${iconSize.size}`);

	if (statusEl) statusEl.textContent = "Generating...";
	if (downloadBtn) downloadBtn.disabled = true;
	if (previewEl) previewEl.innerHTML = "";

	try {
		const blob = await captureGhostAsImage(iconSize.size);

		// Show preview - scale to fit 64x64 container while maintaining aspect ratio
		if (previewEl) {
			const img = document.createElement("img");
			img.src = URL.createObjectURL(blob);
			img.style.maxWidth = "100%";
			img.style.maxHeight = "100%";
			img.style.width = "auto";
			img.style.height = "auto";
			img.style.objectFit = "contain";
			img.style.imageRendering = "pixelated"; // Keep sharp edges for small icons
			previewEl.appendChild(img);
		}

		if (statusEl) statusEl.textContent = "✓ Ready";
		if (downloadBtn) {
			downloadBtn.disabled = false;
			downloadBtn.onclick = () => downloadBlob(blob, iconSize.name);
		}
	} catch (error) {
		console.error(`Failed to generate ${iconSize.name}:`, error);
		if (statusEl) statusEl.textContent = `✗ Error: ${error}`;
		if (downloadBtn) downloadBtn.disabled = true;
		if (previewEl) previewEl.innerHTML = "";
	}
}

async function generateAllIcons() {
	const generateAllBtnWrapper = document.getElementById("generate-all-btn");
	const generateAllBtn = generateAllBtnWrapper?.querySelector("button");
	if (generateAllBtn) generateAllBtn.disabled = true;

	for (const iconSize of ICON_SIZES) {
		await generateIcon(iconSize);
	}

	if (generateAllBtn) generateAllBtn.disabled = false;
}

function createPreviewGhost() {
	const previewContainer = document.getElementById("ghost-preview");
	if (!previewContainer) return;

	// Clear existing preview
	previewContainer.innerHTML = "";

	const canvas = document.createElement("canvas");
	canvas.width = 400;
	canvas.height = 400;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	drawGhost(ctx, 400);
	previewContainer.appendChild(canvas);
}

function renderIconsPage() {
	const container = document.getElementById("app");
	if (!container) return;

	const template = html`
		<div class="min-h-screen bg-background text-foreground p-6">
			<!-- Header -->
			<div class="max-w-4xl mx-auto">
				<div class="flex items-center gap-4 mb-8">
					${Button({
						variant: "ghost",
						size: "sm",
						children: html`<span class="flex items-center gap-2">${icon(ArrowLeft, "sm")} <span>Back to Debug</span></span>`,
						onClick: () => {
							window.location.href = "/debug.html";
						},
					})}
					<h1 class="text-3xl font-bold">Icon Generator</h1>
				</div>

				<!-- Instructions -->
				<div class="bg-card border border-border rounded-lg p-6 mb-8">
					<h2 class="text-xl font-semibold mb-3">Instructions</h2>
					<ol class="list-decimal list-inside space-y-2 text-muted-foreground">
						<li>Preview the ghost logo below</li>
						<li>Click "Generate All Icons" or generate individual sizes</li>
						<li>Download each icon using the download buttons</li>
						<li>Replace the icon files in the <code class="px-1.5 py-0.5 bg-secondary rounded text-xs">static/</code> directory</li>
					</ol>
				</div>

				<!-- Preview Section -->
				<div class="bg-card border border-border rounded-lg p-6 mb-8">
					<h2 class="text-xl font-semibold mb-4">Preview</h2>
					<div class="flex justify-center">
						<div id="ghost-preview" class="relative" style="width: 400px; height: 400px;"></div>
					</div>
				</div>

				<!-- Icon Generation Section -->
				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-xl font-semibold">Generate Icons</h2>
						<div id="generate-all-btn">
							${Button({
								children: html`<span class="flex items-center gap-2">${icon(Download, "sm")} <span>Generate All Icons</span></span>`,
								onClick: generateAllIcons,
							})}
						</div>
					</div>

					<div class="space-y-4">
						${ICON_SIZES.map(
							(iconSize) => html`
								<div class="flex items-center justify-between p-4 bg-secondary rounded-lg">
									<div class="flex items-center gap-4">
										<div id="preview-${iconSize.size}" class="w-16 h-16 bg-background rounded border border-border flex items-center justify-center">
											<span class="text-xs text-muted-foreground">${iconSize.size}×${iconSize.size}</span>
										</div>
										<div>
											<div class="font-medium">${iconSize.name}</div>
											<div id="status-${iconSize.size}" class="text-sm text-muted-foreground">Not generated</div>
										</div>
									</div>
									<div class="flex items-center gap-2">
										${Button({
											size: "sm",
											variant: "outline",
											children: "Generate",
											onClick: () => generateIcon(iconSize),
										})}
										<div id="download-${iconSize.size}">
											${Button({
												size: "sm",
												disabled: true,
												children: html`<span class="flex items-center gap-2">${icon(Download, "sm")} <span>Download</span></span>`,
												onClick: () => {}, // Will be replaced dynamically
											})}
										</div>
									</div>
								</div>
							`,
						)}
					</div>
				</div>
			</div>
		</div>
	`;

	render(template, container);

	// Create the preview ghost after rendering
	requestAnimationFrame(() => {
		createPreviewGhost();
	});
}

// Initialize
renderIconsPage();
