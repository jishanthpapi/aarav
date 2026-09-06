# Test-driven security work — 2026-09-06

This report distinguishes reproduced application failures from dependency advisories and unmeasured aerodynamic claims. Provider calls in the security tests are mocked at the Anthropic SDK boundary: no API quota was spent. The middleware test uses a real HTTP server bound to loopback.

## Verification history

- Original `npm test`: **28 passed, 0 failed**, recorded in `security-tests-before.txt`.
- Added reproductions against the original implementation: **42 total, 33 passed, 9 failed**, recorded in `security-tests-reproduced.txt`.
- Final `npm test`: **46 total, 46 passed, 0 failed, 0 skipped**. `npm run typecheck` passed. The `npm run build` executed by the bundle test passed (Vite reported 2,135 transformed modules; see the captured output for the authoritative number). See `security-tests-after.txt`, `security-typecheck-output.txt`, and `security-build-output.txt` for actual command output. The build retains the existing large-chunk warning.

The test script was already `node scripts/run-tests.mjs` on inspection. It discovers every `tests/*.test.mjs` file. No files were excluded to make the result pass. The old tool test expected range clamping; it was strengthened to require rejection of out-of-range model arguments, while normal UI slider clamping remains supported.

This checkout names the device-budget helper `gridCellBudget`; no `chooseCellBudget` function exists. Tests exercise the actual helper and planner used by the application.

## Reproduced failures and fixes

| Failure demonstrated before the fix | Reproducing test | Implemented fix |
| --- | --- | --- |
| All 25 rapid calls reached the provider mock, with no 429 response | `security-api`: chat enforces a 20-request per-minute caller cap | 20 requests per caller per minute; additional 60-request process cap; explicit 429 and Retry-After |
| A foreign Origin reached the direct handler and provider mock | `security-api`: chat origin policy rejects arbitrary, null, malformed and missing origins | Origin enforcement moved into the handler; middleware forwards the real Origin |
| A multi-megabyte message, unsupported content blocks, and malformed/deep scene data were accepted | `security-api`: request fuzz cases are rejected with 400 before a provider call | 128 KiB streaming body bound, 16,384-character string limit, bounded tree depth/node count, and message/scene validation |
| A huge requested planner budget produced a grid beyond the solver allocation ceiling | `security-resources`: planner and cell budget cannot exceed the solver memory ceiling | Planner clamps to the same 512 MiB solver-buffer ceiling already used by the device budget helper |
| Numeric slot transforms returned non-finite geometry | `security-resources`: slot geometry rejects non-finite numeric values | Transform entry points reject NaN and infinities |
| Malformed triangle arrays were accepted | `security-resources`: voxelization rejects malformed triangle soups | Validate Float32 type, triangle layout, finite coordinates and 100,000-triangle ceiling before allocation |
| An oversized grid attempted allocation before rejection | `security-resources`: voxelization rejects oversized grids before attempting an allocation | Grid dimensions/product/spacing/origin checked before typed-array allocation; the test intercepts allocation instead of exhausting real memory |
| A tool value outside the declared range was silently clamped | Extended `vehicles-tutor-flow`: tutor tools use current vehicle… | Model tool inputs outside min/max now return an error |
| Prototype-related keys, nested objects and extra arguments were accepted by a tool | `vehicles-tutor-flow`: hostile tool arguments are rejected… | Exact own-field allowlists, plain-object and scalar checks; no state mutation on rejection |

The last six findings are local input-boundary failures. These tests do not establish a remote exploit path to the grid or worker, and acceptance of a prototype-related key is not evidence that prototype pollution actually occurred. The test checks that the prototype stays unchanged.

Additional regression checks cover middleware origin forwarding, spoofed forwarded-IP headers, expiry/global rate limits, actual worker error replies, missing-key error hygiene, `.env` exclusion, unknown tool rejection, absence of dynamic code execution in the response path, and absence of HTML injection sinks.

The production-bundle test runs **npm run build** with a deliberately fake key sentinel, then scans every file in `dist/` for the literal server-key variable name, the sentinel and key-shaped strings. It runs under the real `npm test` command. A clean scan covers generated build artifacts; it is not an audit of hosting logs or provider infrastructure.

## Origin and rate policy

This is a same-origin browser endpoint, not an open cross-origin API. POST requests require an exact Origin match, including scheme and port. Missing, null and malformed Origin values are rejected. Set `AARAV_APP_ORIGIN` to the canonical HTTPS origin when behind a reverse proxy; otherwise the request URL origin is used. Origin is not an authentication credential and non-browser clients can forge it.

The local middleware obtains the caller address from the socket and never trusts client-supplied forwarded-IP headers. Direct handler invocations without trusted context share one bucket. Tool-loop requests count separately. Counters are bounded and expire after a minute. The process cap also limits callers changing identities.

**Remaining deployment work:** no login/authorization or durable distributed quota exists. Counters reset on process restart and are not shared across replicas; reverse proxies share a caller bucket unless a trusted deployment adapter is added. The tests of allowed same-origin calls make no authentication claim. Before exposing a billed endpoint publicly, add authentication plus a shared quota/budget policy. The implemented cap is a first-pass local safeguard, not a complete billing-abuse solution.

## Dependency audit and license records

`npm audit --json` is preserved in `npm-audit-baseline.json`: **2 affected dependency entries, 1 high and 1 moderate**. No dependency versions were changed by this task.

- **Vite (high):** reported development-server advisories include optimized dependency map traversal, Windows UNC handling and filesystem-deny bypass. **Deferred/unresolved**, not classified as a false positive. The audit proposes a major Vite upgrade; that migration needs its own runtime/toolchain checks. The dev server is not approved here for public hosting.
- **esbuild (moderate):** reported development-server cross-origin access advisory, inherited through Vite. **Deferred/unresolved** with the Vite migration. No exploit reproduction was run against this dependency, so it is an audit advisory rather than a locally demonstrated application finding.

`dependency-licenses.json` inventories 317 lockfile entries using installed manifests/license text where available. The two dependencies added during the prior merge, `@anthropic-ai/sdk` and `@types/node`, are MIT-licensed. Their transitive licenses were also inventoried; none remain unknown in the report. MIT, ISC, BSD and Apache-2.0 components can be included while retaining their own notices and obligations. `caniuse-lite` uses CC-BY-4.0 data attribution and is recorded separately; it is not relabelled as MIT. `THIRD-PARTY-NOTICES.txt` preserves installed license/NOTICE texts. No licenses or dependency sources were silently changed.

Wall-model physical validation and aerodynamic accuracy remain unmeasured by this security task.
