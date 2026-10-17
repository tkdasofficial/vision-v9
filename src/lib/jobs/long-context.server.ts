// Long Context Generation job runner: drives the vision-sandbox pipeline (plan and
// chunks persisted in the vision-sandbox D1 database) and delivers the assembled,
// validated result as a real file artifact. Resumable: completed chunks are never
// regenerated; a retry of the job resumes the same sandbox job via requestId.
import type { JobRun } from "./jobs.server";
import { CATALOG_COLUMNS, catalogChunkMessages, catalogOutline, normalizeRecord, parseRecords, rowCountFor, validateCatalog, wantsWorkbook } from "./long-context";
import { XLSX_STYLE_INTEGER, XLSX_STYLE_ONE_DECIMAL, XLSX_STYLE_PRICE } from "@/lib/tools/office";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_CONCURRENT = 3;
const CHUNK_ATTEMPTS = 3;
const CATALOG_TOKENS = 8000;

type Call = (messages: unknown[], maxTokens: number) => Promise<{ ok: boolean; text?: string; reason?: string }>;
/** The orchestrator requires an AbortSignal; jobs have no caller signal, so each call gets a fresh one. */
export async function callOrchestrator(messages: unknown[], maxTokens: number) {
  const { orchestrateText } = await import("@/lib/ai/orchestrator.server");
  return orchestrateText(messages, { maxTokens, deep: false, signal: new AbortController().signal, taskId: "long-context" });
}
const defaultCall: Call = (messages, maxTokens) => callOrchestrator(messages, maxTokens);

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export type PipelineResult = { sandboxJobId: string; chunks: number; rows?: unknown[][]; text?: string };

/**
 * Runs (or resumes) the sandbox pipeline for one request. All planning and chunk
 * state lives in the vision-sandbox database, so a job retry continues where it stopped.
 */
export async function runPipeline(userId: string, requestId: string, prompt: string, opts: { db?: any; call?: Call; onProgress?: (done: number, total: number) => void | Promise<void> } = {}): Promise<PipelineResult> {
  const db = opts.db ?? (await import("@/lib/sandbox/db.server")).sandboxDb;
  const call = opts.call ?? defaultCall;
  const store = await import("@/lib/sandbox/store.server");
  const gen = await import("@/lib/sandbox/generation");
  const excel = wantsWorkbook(prompt);
  const totalRows = excel ? rowCountFor(prompt) : 0;

  const sjob = await store.createJob(userId, { instructions: prompt, settings: { format: excel ? "xlsx" : "md", rows: totalRows || undefined }, requestId }, db);

  let plan = await store.loadPlan(userId, sjob.id, db);
  if (!plan) {
    await store.setJobStatus(userId, sjob.id, ["pending", "failed"], "planning", {}, db);
    let outline: string[];
    if (excel) outline = catalogOutline(totalRows);
    else {
      const { planOutline } = await import("@/lib/sandbox/runner.server");
      // The sandbox runner's Call carries provider telemetry this pipeline does not produce;
      // planOutline only reads ok/text, so the adapter is cast to its signature.
      outline = await planOutline(prompt, (async (m: unknown[], t: number) => {
        const r = await call(m, t);
        return r.ok ? { ok: true, text: r.text ?? "" } : { ok: false, status: 502, reason: r.reason ?? "provider unavailable" };
      }) as unknown as Parameters<typeof planOutline>[1], new AbortController().signal);
    }
    plan = gen.buildPlan(prompt, outline, excel ? { chunkTargetTokens: CATALOG_TOKENS } : {});
    await store.savePlan(userId, sjob.id, plan, db);
    await store.setJobStatus(userId, sjob.id, null, "generating", { total_chunks: plan.chunks.length }, db);
  } else {
    await store.setJobStatus(userId, sjob.id, ["pending", "planning", "failed"], "generating", { total_chunks: plan.chunks.length }, db);
    await store.markRetryable(userId, sjob.id, db);
  }

  const batchFor = (seq: number) => Math.min(50, totalRows - seq * 50);
  for (const wave of gen.scheduleWaves(plan.chunks)) {
    const chunks = await store.listChunks(userId, sjob.id, db);
    await runLimited(wave, MAX_CONCURRENT, async (seq) => {
      const existing = chunks.find((c: any) => c.seq === seq);
      if (existing?.status === "completed" && existing.content) return; // never regenerate
      for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt++) {
        const claimed = await store.claimChunk(userId, sjob.id, seq, db);
        if (!claimed) break; // completed or owned elsewhere
        const spec = plan!.chunks[seq];
        const messages = excel
          ? catalogChunkMessages(prompt, spec.title, batchFor(seq))
          : gen.chunkMessages(gen.buildChunkContext({ instructions: prompt, outline: plan!.outline, chunk: spec, completed: [], policy: plan!.contextPolicy }), spec.tokenBudget);
        const res = await call(messages, excel ? CATALOG_TOKENS : spec.tokenBudget);
        const text = res.ok ? (res.text ?? "").trim() : "";
        if (text) {
          if (await store.completeChunk(userId, sjob.id, seq, text, gen.estimateTokens(text), db)) break;
        }
        await store.failChunk(userId, sjob.id, seq, res.ok ? "Empty chunk" : (res.reason ?? "Generation failed"), db);
        if (attempt < CHUNK_ATTEMPTS) await store.markRetryable(userId, sjob.id, db);
      }
      const done = (await store.listChunks(userId, sjob.id, db)).filter((c: any) => c.status === "completed").length;
      await opts.onProgress?.(done, plan!.chunks.length);
    });
  }

  const final = await store.listChunks(userId, sjob.id, db);
  const missing = final.filter((c: any) => c.status !== "completed" || !c.content);
  if (missing.length) {
    await store.setJobStatus(userId, sjob.id, null, "failed", { error: `${missing.length} section(s) failed; retry to resume.` }, db);
    throw new Error(`${missing.length} of ${plan.chunks.length} sections could not be generated. Retry the task — finished sections are kept.`);
  }
  const assembly = gen.validateAssembly(final);
  if (!assembly.ok) {
    await store.saveOutput(userId, sjob.id, "", false, assembly.problems.join("; "), db);
    await store.setJobStatus(userId, sjob.id, null, "failed", { error: "Assembly validation failed" }, db);
    throw new Error(`The generated sections did not fit together: ${assembly.problems[0]}`);
  }

  if (!excel) {
    const text = gen.assemble(final.map((c: any) => ({ seq: c.seq, content: c.content })));
    await store.saveOutput(userId, sjob.id, text, true, undefined, db);
    await store.setJobStatus(userId, sjob.id, ["generating", "assembling"], "completed", {}, db);
    return { sandboxJobId: sjob.id, chunks: plan.chunks.length, text };
  }
  const rows = final.flatMap((c: any) => parseRecords(c.content!).map(normalizeRecord));
  const check = validateCatalog(rows, totalRows);
  if (!check.ok) {
    await store.saveOutput(userId, sjob.id, JSON.stringify({ rows: rows.length }), false, check.problems.join("; "), db);
    await store.setJobStatus(userId, sjob.id, null, "failed", { error: "Catalog validation failed" }, db);
    throw new Error(`The assembled catalog failed validation: ${check.problems[0]}`);
  }
  await store.saveOutput(userId, sjob.id, JSON.stringify({ rows: rows.length, columns: CATALOG_COLUMNS.length }), true, undefined, db);
  await store.setJobStatus(userId, sjob.id, ["generating", "assembling"], "completed", {}, db);
  return { sandboxJobId: sjob.id, chunks: plan.chunks.length, rows };
}

/** Stale recovery fails a job with no update for 3 minutes; long provider calls need heartbeats. */
export const JOB_HEARTBEAT_MS = 30_000;

/** Runs `run` while refreshing the job's updated_at, so a live long job is never recovered as interrupted. */
export async function withJobHeartbeat<T>(job: Pick<JobRun, "touch">, heartbeatMs: number, run: () => Promise<T>): Promise<T> {
  const heartbeat = setInterval(() => { job.touch().catch(() => undefined); }, heartbeatMs);
  try {
    return await run();
  } finally {
    clearInterval(heartbeat);
  }
}

export function runLongContext(job: JobRun, input: { prompt?: string }, heartbeatMs = JOB_HEARTBEAT_MS) {
  return withJobHeartbeat(job, heartbeatMs, async () => {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new Error("Describe what you want generated.");
    const { sandboxReady } = await import("@/lib/sandbox/db.server");
    if (!sandboxReady()) throw new Error("The long-context store is unavailable.");
    const excel = wantsWorkbook(prompt);

    await job.step("planning", excel ? "Planning the record batches" : "Planning the sections");
    let result: PipelineResult;
    await job.step("generating", excel ? `Generating ${rowCountFor(prompt)} records in batches` : "Generating sections");
    result = await runPipeline(job.userId, job.id, prompt, {
      onProgress: async (done, total) => { await job.note(`Generated ${done} of ${total} sections`, total ? done / total : null); },
    });

  await job.step("validating", excel ? "Validating every record" : "Validating the assembled output");
  if (excel && result.rows) {
    await job.step("saving", "Building the Excel workbook");
    const { writeXlsx } = await import("@/lib/tools/office");
    const widths = [10, 28, 16, 14, 14, 46, 10, 9, 14, 12, 18, 8, 12, 10, 18, 14];
    const colStyles = { 6: XLSX_STYLE_PRICE, 8: XLSX_STYLE_INTEGER, 11: XLSX_STYLE_ONE_DECIMAL, 12: XLSX_STYLE_INTEGER } as const;
    const bytes = writeXlsx([{ name: "Products", rows: [[...CATALOG_COLUMNS], ...result.rows] }], { freezeHeader: true, autoFilter: true, widths, colStyles });
    const total = result.rows.length;
    const fileName = `product-catalog-${total}-records.xlsx`;
    const art = await job.saveArtifact(fileName, XLSX_MIME, bytes, "file");
    await job.finish({ prompt, fileName, rows: total, chunks: result.chunks, artifactId: art.id });
    return;
  }
  await job.step("saving", "Saving the document");
  const { strToU8 } = await import("fflate");
  const art = await job.saveArtifact("generated-document.md", "text/markdown", strToU8(result.text ?? ""), "file");
  await job.finish({ prompt, fileName: "generated-document.md", chunks: result.chunks, artifactId: art.id });
  });
}
