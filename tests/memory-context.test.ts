import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import { buildMemoryContext, ensureDirs, todayStr, yesterdayStr } from "../lib.ts";
import * as path from "node:path";
import { makeTempDir, cleanup, makeConfig, writeFile } from "./helpers.ts";

let tmpDir: string;

beforeEach(() => { tmpDir = makeTempDir(); });
afterEach(() => { cleanup(tmpDir); });

describe("buildMemoryContext", () => {
	it("returns empty string when no files exist", () => {
		const config = makeConfig(tmpDir);
		assert.strictEqual(buildMemoryContext(config), "");
	});

	it("includes MEMORY.md content", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "Important fact", "utf-8");
		const result = buildMemoryContext(config);
		assert.ok(result.includes("# Memory"));
		assert.ok(result.includes("## MEMORY.md (long-term)"));
		assert.ok(result.includes("Important fact"));
	});

	it("does not include scratchpad in context (available via tool only)", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.scratchpadFile, "# Scratchpad\n\n- [ ] Open task\n- [x] Done task\n", "utf-8");
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("SCRATCHPAD"));
		assert.ok(!result.includes("Open task"));
	});

	it("includes today's daily log", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const today = todayStr();
		writeFile(`${config.dailyDir}/${today}.md`, "Today's entry");
		const result = buildMemoryContext(config);
		assert.ok(result.includes(`## Daily log: ${today} (today)`));
		assert.ok(result.includes("Today's entry"));
	});

	it("includes yesterday's daily log", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const yesterday = yesterdayStr();
		writeFile(`${config.dailyDir}/${yesterday}.md`, "Yesterday's entry");
		const result = buildMemoryContext(config);
		assert.ok(result.includes(`## Daily log: ${yesterday} (yesterday)`));
		assert.ok(result.includes("Yesterday's entry"));
	});

	it("does not include day-before-yesterday logs", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		writeFile(`${config.dailyDir}/2020-01-01.md`, "Old entry");
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("Old entry"));
	});

	it("includes context files when configured", () => {
		const config = makeConfig(tmpDir, { contextFiles: ["SOUL.md"] });
		ensureDirs(config);
		writeFile(`${config.memoryDir}/SOUL.md`, "I am a helpful assistant");
		const result = buildMemoryContext(config);
		assert.ok(result.includes("## SOUL.md"));
		assert.ok(result.includes("I am a helpful assistant"));
	});

	it("skips missing context files", () => {
		const config = makeConfig(tmpDir, { contextFiles: ["MISSING.md"] });
		ensureDirs(config);
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("MISSING.md"));
	});

	it("skips empty context files", () => {
		const config = makeConfig(tmpDir, { contextFiles: ["EMPTY.md"] });
		ensureDirs(config);
		writeFile(`${config.memoryDir}/EMPTY.md`, "   \n  ");
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("EMPTY.md"));
	});

	it("separates sections with ---", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "Memory content", "utf-8");
		writeFile(`${config.dailyDir}/${todayStr()}.md`, "Today content");
		const result = buildMemoryContext(config);
		assert.ok(result.includes("---"));
	});

	it("assembles sections in correct order: context files, memory, today, yesterday", () => {
		const config = makeConfig(tmpDir, { contextFiles: ["SOUL.md"] });
		ensureDirs(config);
		writeFile(`${config.memoryDir}/SOUL.md`, "Soul content");
		fs.writeFileSync(config.memoryFile, "Memory content", "utf-8");
		writeFile(`${config.dailyDir}/${todayStr()}.md`, "Today content");
		writeFile(`${config.dailyDir}/${yesterdayStr()}.md`, "Yesterday content");

		const result = buildMemoryContext(config);
		const soulIdx = result.indexOf("## SOUL.md");
		const memIdx = result.indexOf("## MEMORY.md");
		const todayIdx = result.indexOf("(today)");
		const yesterdayIdx = result.indexOf("(yesterday)");

		assert.ok(soulIdx < memIdx, "SOUL.md should come before MEMORY.md");
		assert.ok(memIdx < todayIdx, "MEMORY.md should come before today");
		assert.ok(todayIdx < yesterdayIdx, "today should come before yesterday");
		assert.ok(!result.includes("SCRATCHPAD"), "scratchpad should not be in context");
	});

	it("includes multiple context files in order", () => {
		const config = makeConfig(tmpDir, { contextFiles: ["A.md", "B.md", "C.md"] });
		ensureDirs(config);
		writeFile(`${config.memoryDir}/A.md`, "File A");
		writeFile(`${config.memoryDir}/B.md`, "File B");
		writeFile(`${config.memoryDir}/C.md`, "File C");
		const result = buildMemoryContext(config);
		const aIdx = result.indexOf("## A.md");
		const bIdx = result.indexOf("## B.md");
		const cIdx = result.indexOf("## C.md");
		assert.ok(aIdx < bIdx);
		assert.ok(bIdx < cIdx);
	});

	it("includes today's catchup INDEX.md", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const today = todayStr();
		const catchupDir = path.join(config.memoryDir, "catchup", today);
		writeFile(`${catchupDir}/INDEX.md`, "<!-- file:1430_browse_hackernews.md -->\nBrowsed Hacker News");
		const result = buildMemoryContext(config);
		assert.ok(result.includes(`## Catchup: ${today} (today)`));
		assert.ok(result.includes("Browsed Hacker News"));
	});

	it("includes yesterday's catchup INDEX.md", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const yesterday = yesterdayStr();
		const catchupDir = path.join(config.memoryDir, "catchup", yesterday);
		writeFile(`${catchupDir}/INDEX.md`, "<!-- file:0900_chat_summary.md -->\nTeam standup summary");
		const result = buildMemoryContext(config);
		assert.ok(result.includes(`## Catchup: ${yesterday} (yesterday)`));
		assert.ok(result.includes("Team standup summary"));
	});

	it("skips catchup INDEX.md when catchup dir does not exist", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		fs.writeFileSync(config.memoryFile, "Memory content", "utf-8");
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("Catchup"));
	});

	it("skips empty catchup INDEX.md", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const today = todayStr();
		const catchupDir = path.join(config.memoryDir, "catchup", today);
		writeFile(`${catchupDir}/INDEX.md`, "   \n  ");
		const result = buildMemoryContext(config);
		assert.ok(!result.includes("Catchup"));
	});

	it("places catchup sections after daily logs", () => {
		const config = makeConfig(tmpDir);
		ensureDirs(config);
		const today = todayStr();
		writeFile(`${config.dailyDir}/${today}.md`, "Today's log entry");
		writeFile(path.join(config.memoryDir, "catchup", today, "INDEX.md"), "Catchup entry");
		const result = buildMemoryContext(config);
		const dailyIdx = result.indexOf("(today)");
		const catchupIdx = result.indexOf("Catchup:");
		assert.ok(dailyIdx < catchupIdx, "daily log should come before catchup");
	});
});
