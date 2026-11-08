# External server for the standalone native inbox probe

`test/native-universal-contract.mjs` is an explicit diagnostic, not part of the
normal `test/*.test.mjs` selection. Its historical sibling
`test/native-router-server.py` was not recovered in the bounded linked-tree
search. This change does not ship or reconstruct that server. It makes the
external dependency explicit and fails before native extraction if it is absent,
unreadable, wrongly pinned or unspawnable. There is no sibling-path fallback,
substitute backend, automatic download, installation or skipped assertion.

## Inputs and trust boundary

| Variable | Contract |
| --- | --- |
| `CODEX_NATIVE_ROUTER_SERVER` | Absolute readable path to the independently reviewed external Python server. |
| `CODEX_NATIVE_ROUTER_SERVER_SHA256` | Exact lowercase SHA-256 of that reviewed file. Required; mismatch is fatal. The pin identifies bytes, not provenance or native semantics. |
| `CODEX_NATIVE_PYTHON` | Optional absolute readable executable path to the existing compatible Python environment. Otherwise invokes `python` through PATH. Nothing is installed. |
| `HERMES_DESKTOP_SOURCE_ROOT` | Explicit readable native source root, used as child cwd and, for the full probe, the source/locked TypeScript graph. Not permission to change or launch the Hermes application. |
| `CODEX_NATIVE_SCRATCH_ROOT` | Existing private scratch directory; passed to the child as `TMPDIR`. Only disposable synthetic stores may be written here. |
| `CODEX_NATIVE_EVIDENCE_ROOT` | Existing evidence directory, required by the full probe. |

Record the external server's origin, immutable revision, reviewed native imports,
file digest and the compatible native/Python dependency revisions alongside the
run. The launcher cannot establish those facts from a path, hash or PORT line.
A passing preflight **does not** authenticate FastAPI, SessionDB or the grant guard.
Do not publish a native HTTP certification without independently reviewing and
identifying those actual components in the supplied server.

## Required external implementation (not supplied here)

The launcher runs `PYTHON -u SERVER A` then `PYTHON -u SERVER B`, with native
source cwd, configured scratch and `PYTHONDONTWRITEBYTECODE=1`. Each process must:

- Use actual native FastAPI session routes, SessionDB and grant-scope guard from
  the identified native source; no hand-written responses standing in for them.
- Bind its own HTTP listener to **127.0.0.1**, choosing a free ephemeral port.
  After native stores and HTTP service are ready, flush a standalone
  `PORT=<decimal port>\n` line to stdout. The port must be in 1..65535. Logs may
  precede it; readiness output is capped at 64 KiB, startup at 30 seconds.
- Stay in the foreground, single process (no worker/daemon descendants), until
  SIGTERM. Its runtime and stores must not touch user state or credentials.
- Provide three isolated disposable stores per source, for native profiles
  `default`, `alpha`, `beta` (six total). Each owns session ID `same-durable-id`
  with title `A:default`, `A:alpha`, etc.; at least one message qualifies each
  session for `min_messages=1`. Desktop profile `desk` maps to native `alpha`
  through the unchanged desktop route translation, not a server-side fake alias.
- Serve actual session list/detail routes used by the native transport, preserve
  owner isolation and native metadata filtering, and apply the real grant scope
  guard to the probe's `x-probe-bound-profile` binding. The attempted
  `/api/sessions?profile=all` read with default-bound grant must return 403.
  Synthetic descriptor/grant **issuance** is modeled by the existing probe;
  native enforcement must not be replaced with a constant denial stub.

Errors and exits before readiness are fatal. The launcher reports spawn errors,
malformed handshakes and bounded stderr. Its owned child is stopped on startup
failure; callers stop already-ready children in `finally`, including when B
fails. SIGTERM cleanup escalates to SIGKILL after one second and waits for close.
The file pin is rechecked immediately before each spawn; inputs must not be
modified concurrently during the run.

## Invocation

Supply paths from your own authenticated inputs; these are placeholders, not
machine defaults. Hash the reviewed source, not a downloaded or invented stub.

```sh
export CODEX_NATIVE_ROUTER_SERVER='/absolute/reviewed/native-router-server.py'
export CODEX_NATIVE_ROUTER_SERVER_SHA256='<reviewed 64-character lowercase SHA-256>'
export CODEX_NATIVE_PYTHON='/absolute/existing/native-env/bin/python'
export HERMES_DESKTOP_SOURCE_ROOT='/absolute/authenticated/native-source'
export CODEX_NATIVE_SCRATCH_ROOT='/absolute/existing/private-scratch'
export CODEX_NATIVE_EVIDENCE_ROOT='/absolute/existing/evidence'

# No browser or native source extraction: dependency readiness/lifecycle ONLY.
node test/native-router-preflight.mjs

# Separately authorized full native source + HTTP + browser diagnostic.
# Requires the native locked Node graph and the browser inputs/authorization
# documented by test/helpers/universal-fixture.mjs and chromium.mjs.
node test/native-universal-contract.mjs
```

Preflight prints `DEPENDENCY_PREFLIGHT_ONLY`, the file identity, A/B endpoints,
cleanup receipt and explicit `nativeHttpCertified: false` /
`browserCertified: false`. It does not issue HTTP requests. Do not promote that
receipt into a passing native gate. The full diagnostic retains all six-store,
alias, collision, metadata, interception, 403 and browser assertions. Its result
records the external server identity; native-server provenance still needs the
independent review described above.

## Bounded regression check (no Chrome)

```sh
node --test --test-concurrency=1 test/native-router-dependency.test.mjs
```

These tests use a clearly labeled socket-only Python **process protocol test
double**, not a native backend. Real Python processes validate path/pin handling,
A/B argv, cwd, scratch, PORT parsing, listening sockets and cleanup. Negative
cases cover bad inputs, changed pins, Python spawn failure, early exit, malformed
ports, excessive output and timeout. Neither these tests nor their socket-only
child certify HTTP behavior, native modules, grant enforcement or live activity.

The missing original server remains a native-HTTP qualification blocker until an
authenticated compatible external implementation is supplied. Browser/native
acceptance and full CI were not run as part of this dependency repair. Adding or
changing this test/helper closure also requires the normal independent CI-input
requalification; do not merely refresh `scripts/ci-inputs.json` to admit it.
