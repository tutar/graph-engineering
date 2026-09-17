import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const publisher = new URL("../files/.github/loop-engineering/publish-review.mjs", import.meta.url).pathname;
const target = { repository: "acme/widgets", number: 42, baseSha: "base", headSha: "head" };
const externalId = "github-pr-review/v0.1.5:acme/widgets:pull-request:42:head";
const existing = { id: 7, name: "Loop Engineering / PR Review", head_sha: "head", external_id: externalId };

// Adversarial latest/all fixture; the Bundle 6 creation-time token response
// was not logged, so this is not a claimed replay of that exact response.
async function withPublisher(pages, run, { moveHead = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "review-history-"));
  const artifact = join(directory, "pr-review-artifact");
  await mkdir(artifact);
  await writeFile(join(artifact, "pr-review-target.json"), JSON.stringify(target));
  await writeFile(join(artifact, "review-result.json"), JSON.stringify({
    repository: target.repository, pullRequestNumber: target.number,
    baseSha: target.baseSha, headSha: target.headSha,
    standards: { verdict: "pass", findings: [] }, spec: { verdict: "pass", findings: [] },
    runtime: { terminal: "completed", summary: "validated" },
  }));
  const writes = [], queries = [];
  let headReads = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && url.pathname.endsWith("/pulls/42")) {
      headReads += 1;
      response.end(JSON.stringify({ head: { sha: moveHead && headReads > 1 ? "moved" : target.headSha } }));
    } else if (request.method === "GET" && url.pathname.endsWith("/check-runs")) {
      queries.push(url);
      const page = Number(url.searchParams.get("page") ?? 1);
      response.end(JSON.stringify({ check_runs: url.searchParams.get("filter") === "all" ? (typeof pages === "function" ? pages(page) : (pages[page - 1] ?? [])) : [] }));
    } else if (["POST", "PATCH"].includes(request.method)) {
      writes.push({ method: request.method, path: url.pathname });
      request.resume();
      response.end(JSON.stringify({ id: 7 }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const publish = () => execute(process.execPath, [publisher], {
      cwd: directory,
      env: { ...process.env, GH_TOKEN: "fixture-token", GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, UPSTREAM_RESULT: "success" },
    });
    await run({ publish, writes, queries, directory });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("rerun updates historical matching Check even when latest view is empty", async () => {
  await withPublisher([[existing]], async ({ publish, writes, queries }) => {
    await publish();
    assert.deepEqual(writes, [{ method: "PATCH", path: "/repos/acme/widgets/check-runs/7" }]);
    assert.equal(queries[0].searchParams.get("filter"), "all");
  });
});

test("multiple same-identity Checks fail closed instead of updating one", async () => {
  await withPublisher([[existing, { ...existing, id: 8 }]], async ({ publish, writes, directory }) => {
    await assert.rejects(publish(), /duplicate-review-check/);
    assert.equal(writes.length, 0);
    assert.match(await readFile(join(directory, "review-diagnostic.md"), "utf8"), /duplicate-review-check/);
  });
});

test("matching identity on later page is updated, not duplicated", async () => {
  const unrelated = Array.from({ length: 100 }, (_, i) => ({ ...existing, id: i + 100, external_id: `other-${i}` }));
  await withPublisher([unrelated, [existing]], async ({ publish, writes, queries }) => {
    await publish();
    assert.deepEqual(writes, [{ method: "PATCH", path: "/repos/acme/widgets/check-runs/7" }]);
    assert.equal(queries.length, 2);
    assert.equal(queries[1].searchParams.get("page"), "2");
  });
});

test("duplicate identity split across pages still prevents all writes", async () => {
  const first = [existing, ...Array.from({ length: 99 }, (_, i) => ({ ...existing, id: i + 100, external_id: `other-${i}` }))];
  await withPublisher([first, [{ ...existing, id: 8 }]], async ({ publish, writes }) => {
    await assert.rejects(publish(), /duplicate-review-check/);
    assert.equal(writes.length, 0);
  });
});

test("malformed history and invalid IDs are not interpreted as absence", async () => {
  for (const rows of [{ invalid: true }, [{ ...existing, id: null }], [existing, existing]]) {
    await withPublisher([rows], async ({ publish, writes }) => {
      await assert.rejects(publish(), /check-history/);
      assert.equal(writes.length, 0);
    });
  }
});

test("pagination limit fails closed instead of creating from truncated history", async () => {
  const pages = (page) => Array.from({ length: 100 }, (_, i) => ({ ...existing, id: page * 100 + i, external_id: `other-${page}-${i}` }));
  await withPublisher(pages, async ({ publish, writes, queries }) => {
    await assert.rejects(publish(), /pagination limit/);
    assert.equal(queries.length, 100);
    assert.equal(writes.length, 0);
  });
});

test("incomplete identity fields do not turn malformed history into a new Check", async () => {
  for (const row of [
    { ...existing, name: undefined },
    { ...existing, head_sha: undefined },
    { ...existing, external_id: undefined },
    { ...existing, external_id: 9 },
    { ...existing, head_sha: "other-head" },
  ]) {
    await withPublisher([[row]], async ({ publish, writes }) => {
      await assert.rejects(publish(), /check-history/);
      assert.equal(writes.length, 0);
    });
  }
});

test("head changes during history lookup prevent publication", async () => {
  await withPublisher([[existing]], async ({ publish, writes }) => {
    await assert.rejects(publish(), /stale-target/);
    assert.equal(writes.length, 0);
  }, { moveHead: true });
});
