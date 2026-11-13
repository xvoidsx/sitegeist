#!/usr/bin/env node
// Applies the sitegeist node_modules patches in patches/ (numeric order).
//
// Why: `npm install` wipes node_modules, so the hand-applied fixes in
// PATCHES.md would be lost on a fresh clone. This script is wired to the
// `postinstall` hook in package.json, so a clean `npm install` re-applies
// every patch automatically. It is idempotent: running it twice changes
// nothing the second time (already-applied hunks are detected and skipped).
//
// Each patch file is a plain unified diff against the published
// @mariozechner/* 0.73.1 packages. The script refuses to run against a
// different installed version instead of mis-applying hunks silently.
//
// Usage: node scripts/apply-patches.mjs  (run from the repo root, or anywhere;
// paths resolve relative to this file)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATCHES_DIR = join(REPO_ROOT, "patches");
const NODE_MODULES = join(REPO_ROOT, "node_modules");

const EXPECTED_VERSIONS = {
	"@mariozechner/pi-ai": "0.73.1",
	"@mariozechner/pi-agent-core": "0.73.1",
	"@mariozechner/pi-web-ui": "0.73.1",
};

function fail(message) {
	console.error(`[apply-patches] ERROR: ${message}`);
	process.exit(1);
}

// --- unified-diff parsing -------------------------------------------------

function parsePatch(text, name) {
	const lines = text.split("\n");
	const files = [];
	let i = 0;
	// Skip the leading "# ..." header comment block.
	while (i < lines.length && (lines[i].startsWith("#") || lines[i] === "")) i++;
	while (i < lines.length) {
		if (!lines[i].startsWith("--- ")) {
			if (lines[i] === "") {
				i++;
				continue;
			}
			fail(`${name}: unexpected line ${i + 1}: ${lines[i]}`);
		}
		const oldPath = lines[i].slice(4).trim();
		const newPath = lines[i + 1].slice(4).trim();
		if (!lines[i + 1].startsWith("+++ ")) fail(`${name}: expected +++ after --- at line ${i + 1}`);
		if (oldPath.replace(/^a\//, "") !== newPath.replace(/^b\//, "")) {
			fail(`${name}: ---/+++ paths differ: ${oldPath} vs ${newPath}`);
		}
		const rel = oldPath.replace(/^a\//, "");
		i += 2;
		const hunks = [];
		while (i < lines.length && lines[i].startsWith("@@ ")) {
			const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
			if (!m) fail(`${name}: bad hunk header: ${lines[i]}`);
			const oldStart = Number(m[1]);
			const oldCount = m[2] === undefined ? 1 : Number(m[2]);
			const newCount = m[4] === undefined ? 1 : Number(m[4]);
			i++;
			const body = [];
			let seenOld = 0;
			let seenNew = 0;
			while (i < lines.length && (seenOld < oldCount || seenNew < newCount)) {
				const line = lines[i];
				if (line.startsWith("\\")) {
					// "\ No newline at end of file" — marks the previous body line.
					if (body.length === 0) fail(`${name}: stray newline marker`);
					body[body.length - 1].noNewline = true;
					i++;
					continue;
				}
				const kind = line[0];
				if (kind !== " " && kind !== "-" && kind !== "+") {
					fail(`${name}: bad hunk body line: ${line}`);
				}
				body.push({ kind, text: line.slice(1) });
				if (kind === " " || kind === "-") seenOld++;
				if (kind === " " || kind === "+") seenNew++;
				i++;
			}
			if (seenOld !== oldCount || seenNew !== newCount) {
				fail(`${name}: hunk at -${oldStart} has wrong line counts`);
			}
			hunks.push({ oldStart, body });
		}
		files.push({ rel, hunks });
	}
	return files;
}

// --- hunk application -----------------------------------------------------

function splitContent(content) {
	// Returns { lines, endsWithNewline }.
	const endsWithNewline = content.endsWith("\n");
	const lines = content.split("\n");
	if (endsWithNewline) lines.pop();
	return { lines, endsWithNewline };
}

function joinContent({ lines, endsWithNewline }) {
	return lines.join("\n") + (endsWithNewline ? "\n" : "");
}

function seqLines(body, kinds) {
	const out = [];
	for (const entry of body) {
		if (kinds.includes(entry.kind)) out.push(entry.text);
	}
	return out;
}

function seqNoNewline(body, kinds) {
	// True when the last line of the given sequence has the no-newline marker.
	for (let k = body.length - 1; k >= 0; k--) {
		if (kinds.includes(body[k].kind)) return body[k].noNewline === true;
	}
	return false;
}

function findNearest(lines, seq, expected) {
	// Exact-match search for seq; returns the match nearest to `expected`
	// (0-based). Context lines repeat across a file (e.g. the same case tail
	// in several switch branches), so the nearest match — not the first —
	// is the right one for a pure-insertion hunk.
	let best = -1;
	let bestDist = Infinity;
	outer: for (let at = 0; at + seq.length <= lines.length; at++) {
		for (let k = 0; k < seq.length; k++) {
			if (lines[at + k] !== seq[k]) continue outer;
		}
		const dist = Math.abs(at - expected);
		if (dist < bestDist) {
			best = at;
			bestDist = dist;
		}
	}
	return best;
}

function applyHunk(state, hunk, offset) {
	const before = seqLines(hunk.body, [" ", "-"]);
	const after = seqLines(hunk.body, [" ", "+"]);
	const beforeNoNewline = seqNoNewline(hunk.body, [" ", "-"]);
	const afterNoNewline = seqNoNewline(hunk.body, [" ", "+"]);
	const { lines, endsWithNewline } = state;
	// Hunk headers count lines in the state produced by the previous
	// patches; `offset` is how far this file has drifted from that state
	// (earlier hunks in this run, applied or already present).
	const expected = hunk.oldStart - 1 + offset;

	// 1. Is the hunk already applied? Check FIRST, before trying to match
	// the before-sequence: for a pure-insertion hunk, the before-sequence
	// (context lines only) can match at the location the hunk's own
	// insertion created — the inserted block ends with the same context
	// tail — and applying there would duplicate the code. The test: the
	// hunk's added lines appear in order near the expected location (the
	// first added line must be present, and at least 70% of them). The
	// added lines are distinctive (patch comments, new identifiers), so a
	// coincidental in-order match is not a real risk — and a genuinely
	// unapplied hunk has ~0% of its added lines present. A later patch may
	// insert lines inside this hunk's region or modify lines it added, so
	// the full after-sequence is not a reliable test either.
	const added = hunk.body.filter((entry) => entry.kind === "+").map((entry) => entry.text);
	if (added.length > 0) {
		const start = Math.max(0, expected - 5);
		const end = Math.min(lines.length, expected + before.length + 200);
		let idx = start;
		let found = 0;
		let firstFound = false;
		for (const [n, line] of added.entries()) {
			let atLine = -1;
			for (let k = idx; k < end; k++) {
				if (lines[k] === line) {
					atLine = k;
					break;
				}
			}
			if (atLine === -1) continue;
			if (n === 0) firstFound = true;
			found++;
			idx = atLine + 1;
		}
		if (firstFound && found >= Math.ceil(added.length * 0.7)) return "skipped";
	}

	// 2. Try the expected location first (hunk header), then the nearest match.
	let at = -1;
	if (expected >= 0 && expected + before.length <= lines.length) {
		let ok = true;
		for (let k = 0; k < before.length; k++) {
			if (lines[expected + k] !== before[k]) {
				ok = false;
				break;
			}
		}
		if (ok) at = expected;
	}
	if (at === -1) at = findNearest(lines, before, expected);

	if (at !== -1) {
		// If the hunk touches EOF, the file's trailing-newline state must agree
		// with the hunk's marker, or this is a false-positive match.
		const touchesEof = at + before.length === lines.length;
		if (touchesEof && endsWithNewline === beforeNoNewline) {
			at = -1; // newline state disagrees: not a real match
		}
	}
	if (at !== -1) {
		lines.splice(at, before.length, ...after);
		if (at + after.length === lines.length) {
			state.endsWithNewline = !afterNoNewline;
		}
		return "applied";
	}

	return "missing";
}

// --- main -----------------------------------------------------------------

function main() {
	if (!existsSync(PATCHES_DIR)) fail(`patches/ directory not found at ${PATCHES_DIR}`);
	if (!existsSync(NODE_MODULES)) {
		fail("node_modules not found — run `npm install` (this script is the postinstall hook)");
	}

	// Refuse to patch the wrong published version.
	for (const [pkg, want] of Object.entries(EXPECTED_VERSIONS)) {
		const pkgJsonPath = join(NODE_MODULES, pkg, "package.json");
		if (!existsSync(pkgJsonPath)) fail(`missing installed package ${pkg}`);
		const got = JSON.parse(readFileSync(pkgJsonPath, "utf8")).version;
		if (got !== want) {
			fail(
				`${pkg} is version ${got}, but the patches target ${want}. ` +
					"Update patches/ for the new version instead of applying blindly.",
			);
		}
	}

	const patchFiles = readdirSync(PATCHES_DIR)
		.filter((f) => f.endsWith(".patch"))
		.sort();
	if (patchFiles.length === 0) fail("no .patch files in patches/");

	// Marker: node_modules/.sitegeist-patches.json records the sha256 of
	// each patch file AND of each patched target file after application.
	// `npm install` wipes node_modules, so a fresh install has no marker
	// and applies everything. A re-run with matching patch hashes AND
	// matching file hashes skips everything. If the patch hashes match but
	// a target file's hash differs, the file was tampered with after
	// patching — fail loudly instead of re-applying over it (the fuzzy
	// already-applied check below would otherwise accept a file with a
	// single patched line changed, e.g. a timeout value). If a patch file
	// changed, re-attempt its hunks below (and fail loudly if they no
	// longer match — reinstall node_modules instead of forcing it).
	const markerPath = join(NODE_MODULES, ".sitegeist-patches.json");
	const parsed = patchFiles.map((patchFile) => {
		const patchText = readFileSync(join(PATCHES_DIR, patchFile), "utf8");
		return {
			patchFile,
			hash: createHash("sha256").update(patchText).digest("hex"),
			files: parsePatch(patchText, patchFile),
		};
	});
	const targetRels = [...new Set(parsed.flatMap((p) => p.files.map((f) => f.rel)))];
	const fileHash = (rel) =>
		createHash("sha256")
			.update(readFileSync(join(NODE_MODULES, rel)))
			.digest("hex");
	let marker = null;
	if (existsSync(markerPath)) {
		try {
			marker = JSON.parse(readFileSync(markerPath, "utf8"));
		} catch {
			marker = null;
		}
	}
	if (marker?.patches && marker.files) {
		const patchesMatch = parsed.every((p) => marker.patches[p.patchFile] === p.hash);
		if (patchesMatch) {
			try {
				const tampered = targetRels.filter((rel) => marker.files[rel] !== fileHash(rel));
				if (tampered.length === 0) {
					console.log("[apply-patches] all patches already applied");
					return;
				}
				fail(
					`patched file(s) changed since patching: ${tampered.join(", ")}. ` +
						"Reinstall node_modules (rm -rf node_modules && npm install) instead of forcing it.",
				);
			} catch {
				// A target file is missing or unreadable: fall through to the
				// apply loop, which fails with the specific target named.
			}
		}
	}

	let applied = 0;
	let skipped = 0;
	for (const { patchFile, files } of parsed) {
		// Per-file line drift WITHIN this patch file only. Every hunk in a
		// patch file counts lines in the state the previous patch files
		// produced, so a hunk's header is exact for the file as it stands
		// when this patch file starts; only earlier hunks *in this file*
		// shift later ones (applied or skipped — both mean the file already
		// contains that delta). Do NOT carry drift across patch files: a
		// later patch file's headers already count the earlier patches'
		// lines, and carrying them would double-count and misplace hunks
		// (a pure-insertion hunk with repeating context could then land in
		// the wrong switch case and duplicate code).
		const offsets = new Map();
		const hunkDelta = (hunk) =>
			hunk.body.filter((e) => e.kind === " " || e.kind === "+").length -
			hunk.body.filter((e) => e.kind === " " || e.kind === "-").length;
		for (const { rel, hunks } of files) {
			const target = join(NODE_MODULES, rel);
			if (!existsSync(target)) fail(`${patchFile}: target missing: ${target}`);
			const state = splitContent(readFileSync(target, "utf8"));
			let changed = false;
			for (const hunk of hunks) {
				const result = applyHunk(state, hunk, offsets.get(rel) ?? 0);
				if (result === "applied") {
					applied++;
					changed = true;
				} else if (result === "skipped") {
					skipped++;
				} else {
					fail(
						`${patchFile}: hunk at -${hunk.oldStart} in ${rel} matches neither ` +
							"the original nor the patched text. The installed package may " +
							"have changed — update patches/ instead of forcing it.",
					);
				}
				offsets.set(rel, (offsets.get(rel) ?? 0) + hunkDelta(hunk));
			}
			if (changed) writeFileSync(target, joinContent(state));
		}
		console.log(`[apply-patches] ${patchFile}: ok`);
	}
	const newMarker = {
		patches: Object.fromEntries(parsed.map((p) => [p.patchFile, p.hash])),
		files: Object.fromEntries(targetRels.map((rel) => [rel, fileHash(rel)])),
	};
	writeFileSync(markerPath, `${JSON.stringify(newMarker, null, 2)}\n`);
	console.log(`[apply-patches] done: ${applied} hunks applied, ${skipped} already applied`);
}

main();
