# T3 v0.1.7 collapse comparison

This isolated candidate compares the Hermes skin against T3 Code **v0.1.7**, commit `322f6544dfad0a3c8a0c8cbecf2c7f7874b14268`. It does not modify Hermes. The upstream state machine was inspected as source; the full T3 application was not executed. See [reference provenance](reference-provenance.md#stable-v017-collapse-policy) for source links and attribution.

## Already implemented before this change

- Contiguous native tool/reasoning groups, split by prose and unknown content, in original order.
- Compact current activity, with a completed single tool remaining native.
- Independent group disclosures, closed by default, retaining explicit choices during ordinary appends.
- Reversible outer turn folds, preserving native nodes, event handlers, outputs, action controls and final-response footers.
- Whole-turn timing and the existing `working` / `Worked` labels. Tool durations are not added together to manufacture a turn duration.

## Differences addressed in this candidate

| Previous behavior | Candidate behavior | Proof surface |
| --- | --- | --- |
| Cold hydration could hide an earlier opaque independent final solely because a newer footer existed. | Missing footers and ordering no longer certify interim prose. Unknown answers remain visible, including every paragraph and the same native nodes. | Cold-load DOM and full-module Chromium regressions. |
| Standalone prose and mixed prose used inconsistent classification. | Both require unique historical source evidence before being hidden as pre-tool commentary. | Positive source-identified folds plus ambiguous/duplicate-source negative cases. |
| A DOM loading/streaming gap could let an old footer mark current work completed. | Qualified public SDK busy state and turn events veto completion, fenced to the owning connection, profile, session and turn. | Runtime subscriptions, event ownership, gap and teardown tests. |
| Tool-only turns and completed work after a final stayed uncertain. | A qualified observed settling/end can complete those turns. Disappearance of a DOM loading row alone is insufficient. | Tool-only/trailing-work tests, plus stale completion invalidation. |
| Completed mixed summaries included `Thought` alongside tool captions. | Reasoning is omitted from completed mixed captions, following T3's policy. Native tool labels remain factual. | DOM/native React tests. |
| Full native remount lost explicit expansion choices. | Ephemeral memory is bounded to 100 identities. Outer turn choices and uniquely identifiable whole execution-message groups can be restored. Owner changes revoke unsafe reuse. | Remount, eviction, source/route isolation and late-click tests. |
| A local clarification/error could disable every tool group in the pair. | Only demonstrably local native boundaries admit independent safe work groups. Protected or unknown structures remain visible. | Native topology and CSS-paint regressions. |

## Integrated candidate verification

The rebuilt bundle passed **123/123 DOM/native-React logic tests and 53/53 real Chromium tests**, with zero failures, skips or cancellations in this scoped selection. Chromium includes the two previously failing cold-load cases, six local CSS/AX barrier tests, public-SDK runtime cases, existing tool/turn/thought tests, final retention, incremental historical hydration, lifecycle quietness and the history rail. The 60 stale insertion checks are cases within those tests, not an additional 60 tests.

Both bundle copies are byte-identical, with SHA-256 `8ea84ccbb2e01310698558a47745ce91354fe58f8005fc10bf2ca09579a9effb`. All 270 frozen candidate inputs were unchanged across the integrated run. Receipts are outside the repository in `../verification-integrated-v3/`; this is not a full release or installed-app acceptance verdict.

An independent implementation review also reproduced cross-connection history-cache reuse, stale-pair collapse during a focused-owner publication gap, and expansion leakage when a secondary native message ID changed on reused DOM. Five added regression cases failed before repair and passed afterward, and are included in the integrated logic count. The repairs qualify source caches with the live owner incarnation, reject known stale pairs before incomplete SDK returns, and validate each retained unit's native assistant identity, including late clicks before observer delivery.

Three older test contracts needed explicit migration. The clock fixture now publishes actual public focused-owner coordinates and expects stale native DOM to remain unprojected until remount. Completed mixed captions omit reasoning as required by the T3 policy. Historical hydration now exercises the full shipping observer instead of removed clean-transcript functions, retaining incremental scan, source-identified prose, artifact, final/control identity and cleanup assertions. Its old expectation that a later final hides a previously delivered final was deliberately removed.

## Remaining differences and limits

- **Run, attempt and steer segmentation.** The public DOM/SDK does not expose a reliable per-ToolRun mapping to T3-style run and attempt identities. One outer pair fold is not equivalent to multiple typed T3 segment folds.
- **Exact action counts and categories.** Historical tool-call data exists, but cannot reliably be joined to every mounted or closed native ToolRun. The skin does not manufacture `Read 2 files` or `Thought (×N)` from node counts, duplicate labels or localized prose.
- **Live thought preview.** T3 can show a separate thought preview above the current tool. The skin retains its compact native current-activity presentation. A closed native reasoning disclosure can have no mounted body; no synthetic click, preference bypass or invented preview is used.
- **Native disclosure depth.** Explicitly opening the skin group forwards one click to a closed native run summary, revealing its native tool controls. Individual tool results and sensitive actions stay untouched. Reconciliation, refresh and remount do not click native controls or restore unexposed native internal state. Unavailable members are not reconstructed from a summary.
- **Internal disclosure/scroll restoration.** Native controls on surviving nodes keep their own state. Outer skin memory does not claim to restore unexposed native internal choices or reading positions after all native nodes have been recreated.
- **Unclassified prose.** Opaque prose intentionally remains visible. That can retain an intermediate-looking message when Hermes publishes no reliable classification. Hiding it by position would reintroduce independent-final loss.
- **Failure semantics.** A color or alert is not a typed run failure or a T3 `usage_limit` classification. Unknown/interrupted/global situations stay conservatively visible; exact T3 failure exemptions are not claimed.

## Qualification boundary

This change is an isolated skin candidate, not an installation, release, native-app patch, restart or publication. Browser fixtures exercise real Chromium styles and the full module over public native-shaped DOM/SDK seams; native React fixtures import the inspected host components. Neither substitutes for an installed Mac/Hermes acceptance run. Snoozed, history, preferences and existing external setup are not intentionally changed.
