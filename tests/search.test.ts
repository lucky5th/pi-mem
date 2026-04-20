import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import { searchMemory, ensureDirs } from "../lib.ts";
import * as path from "node:path";
import { makeTempDir, cleanup, makeConfig, writeFile } from "./helpers.ts";

let tmpDir: string;

beforeEach(() => { tmpDir = makeTempDir(); });
afterEach(() => { cleanup(tmpDir); });

describe("searchMemory", () => {
	it("finds content in MEMORY.md", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "Important decision: use PostgreSQL", "utf-8");
		const result = searchMemory(config, "postgresql");
		assert.strictEqual(result.lineResults.length, 1);
		assert.ok(result.lineResults[0].text.includes("PostgreSQL"));
		assert.strictEqual(result.lineResults[0].file, "MEMORY.md");
		assert.strictEqual(result.lineResults[0].line, 1);
	});

	it("finds content in daily logs", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(`${config.dailyDir}/2026-02-18.md`, "line one\nDeployed trading bot\nline three");
		const result = searchMemory(config, "trading bot");
		assert.strictEqual(result.lineResults.length, 1);
		assert.strictEqual(result.lineResults[0].file, "daily/2026-02-18.md");
		assert.strictEqual(result.lineResults[0].line, 2);
	});

	it("finds content in notes", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(`${config.notesDir}/lessons.md`, "Lesson learned: always test");
		const result = searchMemory(config, "lesson");
		assert.strictEqual(result.lineResults.length, 1);
		assert.strictEqual(result.lineResults[0].file, "notes/lessons.md");
	});

	it("is case-insensitive", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "PostgreSQL is great", "utf-8");
		const result = searchMemory(config, "POSTGRESQL");
		assert.strictEqual(result.lineResults.length, 1);
	});

	it("matches filenames", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "some content", "utf-8");
		const result = searchMemory(config, "memory");
		assert.ok(result.fileMatches.includes("MEMORY.md"));
	});

	it("respects maxResults limit", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const lines = Array.from({ length: 50 }, (_, i) => `match line ${i}`).join("\n");
		fs.writeFileSync(config.memoryFile, lines, "utf-8");
		const result = searchMemory(config, "match", 5);
		assert.strictEqual(result.lineResults.length, 5);
	});

	it("returns empty results for no matches", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "nothing relevant here", "utf-8");
		const result = searchMemory(config, "xyznonexistent");
		assert.strictEqual(result.fileMatches.length, 0);
		assert.strictEqual(result.lineResults.length, 0);
	});

	it("returns empty results when no files exist", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const result = searchMemory(config, "anything");
		assert.strictEqual(result.fileMatches.length, 0);
		assert.strictEqual(result.lineResults.length, 0);
	});

	it("searches across all directories", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "target in memory", "utf-8");
		writeFile(`${config.dailyDir}/2026-02-18.md`, "target in daily");
		writeFile(`${config.notesDir}/work.md`, "target in notes");
		const result = searchMemory(config, "target");
		assert.strictEqual(result.lineResults.length, 3);
		const files = result.lineResults.map(r => r.file);
		assert.ok(files.includes("MEMORY.md"));
		assert.ok(files.some(f => f.startsWith("daily/")));
		assert.ok(files.some(f => f.startsWith("notes/")));
	});

	it("does not deduplicate filename matches", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(`${config.dailyDir}/2026-02-18.md`, "some content");
		// Searching for "2026-02-18" matches the filename
		const result = searchMemory(config, "2026-02-18");
		assert.ok(result.fileMatches.includes("daily/2026-02-18.md"));
	});

	it("trims trailing whitespace from matched lines", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "match with trailing spaces   \n", "utf-8");
		const result = searchMemory(config, "match");
		assert.strictEqual(result.lineResults[0].text, "match with trailing spaces");
	});

	it("only searches .md files", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(`${config.memoryDir}/data.json`, '{"target": true}');
		writeFile(`${config.memoryDir}/notes.md`, "target in md");
		// json file should not be content-searched (searchDir filters to .md)
		const result = searchMemory(config, "target");
		assert.strictEqual(result.lineResults.length, 1);
		assert.strictEqual(result.lineResults[0].file, "notes.md");
	});

	it("finds content in catchup subdirectories", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const catchupDir = path.join(config.memoryDir, "catchup", "2026-04-20");
		writeFile(`${catchupDir}/1430_browse_hackernews.md`, "---\nid: abc123\n---\nRead about new Rust async features");
		const result = searchMemory(config, "rust async");
		assert.strictEqual(result.lineResults.length, 1);
		assert.strictEqual(result.lineResults[0].file, "catchup/2026-04-20/1430_browse_hackernews.md");
	});

	it("searches multiple catchup date directories", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(path.join(config.memoryDir, "catchup", "2026-04-19", "note.md"), "target in yesterday");
		writeFile(path.join(config.memoryDir, "catchup", "2026-04-20", "note.md"), "target in today");
		const result = searchMemory(config, "target");
		const catchupResults = result.lineResults.filter(r => r.file.startsWith("catchup/"));
		assert.strictEqual(catchupResults.length, 2);
	});

	it("skips non-date catchup subdirectories", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(path.join(config.memoryDir, "catchup", "not-a-date", "note.md"), "hidden target");
		writeFile(path.join(config.memoryDir, "catchup", "2026-04-20", "note.md"), "visible target");
		const result = searchMemory(config, "target");
		const catchupResults = result.lineResults.filter(r => r.file.startsWith("catchup/"));
		assert.strictEqual(catchupResults.length, 1);
		assert.strictEqual(catchupResults[0].file, "catchup/2026-04-20/note.md");
	});

	it("handles missing catchup directory gracefully", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		// No catchup dir exists — should not throw
		const result = searchMemory(config, "anything");
		assert.strictEqual(result.lineResults.length, 0);
	});

	it("matches catchup filenames", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(path.join(config.memoryDir, "catchup", "2026-04-20", "hackernews.md"), "some content");
		const result = searchMemory(config, "hackernews");
		assert.ok(result.fileMatches.includes("catchup/2026-04-20/hackernews.md"));
	});
});
