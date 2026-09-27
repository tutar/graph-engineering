# Development Codex Action source

This local Action is based on `tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af` (Apache-2.0). `dist/main.js`, `LICENSE`, and `NOTICE` are copied byte-for-byte from that commit. The bundled entrypoint SHA-256 is `c898908d5f1624197c035e85653ca9ef45f2bc39cd524cc441fffa97f38814ca`.

The local patch changes `action.yml` to invoke `scripts/install-runtime.mjs`. That script reuses a runner-installed stable Codex CLI meeting the minimum version, or installs the minimum when none is compatible. It installs a matching Responses API proxy only when the API-key path needs one. `package.json` declares the upstream CommonJS bundle format despite the parent Workflow package's ESM setting. The Task Invocation, Session recovery, authentication, and permission code in `dist/main.js` is unchanged.

The Development Workflow checks out the repository before calling this local Action, including on a rerun. The Action's persistent task state remains outside checkout, so checkout does not replace a recovered workspace or Session.
