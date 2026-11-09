# Inbox design and behavior

[Back to the README](../README.md)

This note describes Inbox in the next release preparation. It keeps the detailed admission, ownership and attention-state rules out of the installation guide. The current stable release remains v1.12.0 until publication.


Open the command palette and run **Codex Skin: Inbox** to switch it On or Off. The preference persists locally; a missing preference defaults to On.

## Working group

Working belongs to Inbox and has no separate switch. **Codex Skin: Inbox** turns both On or Off together, defaulting to On. Existing explicit Inbox Off choices are preserved.

While Inbox is On, only threads with verified **working** display state move out of the main Inbox list. A quiet **Working N** button appears after the main threads, inside Inbox. It counts unique eligible threads, not runtimes or subagents. Click it, or focus it and press Enter or Space, to reveal the grouped threads below the button. Activate it again to collapse them. It starts collapsed and is absent when the group is empty.

Questions and approval requests take precedence over active work, including active subagents, so those threads return to the main list. Completion, failure, idle and unknown activity also belong in the main list. Existing ownership, admission, unread, Settle and Snooze rules remain unchanged. Settled or snoozed threads do not contribute to the count. Grouping never navigates away from an open chat or stops its work. Switching Inbox Off removes the whole Inbox, including Working, and restores the native sidebar. Switching it back On restores Working automatically, collapsed.

#### How to use it

Think of each thread as an independent task.

Once it is finished, hover or keyboard-focus its row and click the right-hand **checkmark** to remove it from Inbox. **It is not archived**, only hidden from Inbox. You can still find it in Sessions.

The goal is to have **an empty Inbox at the end of the day**.

Inbox is **enabled by default**, but you can turn it off whenever you want: open the command palette and select **Codex Skin: Inbox**.

I recommend keeping **Pinned** and **Sessions** collapsed so you can focus on your Inbox. Expand them whenever you need to find an older or pinned chat.

**Inbox only (Beta)** optionally hides Pinned and Sessions without deleting their threads or changing their native expansion choices. It is Off by default and independent of the Inbox On/Off switch. Turn Inbox only Off to show the native lists again. A failed save/readback does not change the applied layout.

**Universal Inbox (Beta)** is Off by default. Turn it On to combine verified threads from available connection/profile routes. Foreign-owner badges use the native profile color and display-name initial, or a home glyph for the default profile. Opening or acting on a row uses that row's own owner. Unavailable or unverified owners do not receive live-action authority. Turning it Off returns to the selected connection/profile.

**Codex Skin: Floating sidebar** toggles the adaptive layout and displays its current On/Off state in the command palette.
It defaults to On; the choice persists locally and takes effect immediately without changing Inbox admissions, Settle/Snooze records or native disclosure state.
Off uses the original Codex Skin sidebar layout, including its bottom-oriented section placement and ordinary spacing.
With Floating sidebar On, when Pinned and Sessions are both collapsed, their headings stay at the bottom of the sidebar.
Opening either section moves both directly below Inbox, without leaving unused space above them.
This alignment follows Pinned and Sessions independently of whether Inbox is open.
The gap below Inbox stays at the ordinary spacing when Working expands, including when Pinned and Sessions are open.
Long lists remain scrollable, and an expanded Sessions list uses the remaining height.

Inbox opens by default above Pinned and Sessions. Its heading and disclosure match the native sections. A chat enters Inbox when fresh, owner-verified agent work is observed, even in an older chat. Cron sessions never enter Inbox: the filter uses Hermes' session `source` and, when present, immutable `created_source`, not titles or IDs. Known non-cron sources may differ when a chat moves between interfaces; missing or unknown provenance and conflicting ownership stay excluded. Creating an empty chat, opening or focusing a chat, reading history, pagination, unread marks and timestamps do not admit it. Admitted non-cron threads remain after work completes until **Settle**; **Snooze** hides them temporarily. Admission persists separately for each connection and profile, including threads older than the recent history page. Disconnected, stale or failed live reads cannot admit new work.

**Settle** removes a thread from Inbox without stopping work, archiving, deleting or unpinning it. A **Settled** badge on an already admitted, verified native session row offers **Un-settle** on hover or keyboard focus. The Inbox Settle check appears on hover or keyboard focus, on the right. Universal Inbox can withhold it until owner and live-status verification succeeds; retained rows awaiting fresh metadata do not gain action authority. A compact **Settled** notice below the remaining threads offers **Undo** for **3000 ms**, with a theme-aware left-to-right progress bar. Only the latest successful settlement has a notice and Undo handle; earlier settlements remain saved. Undo restores that exact thread's attention without navigating. Failed storage writes do not hide the row or show a success notice. A subsequent verified new message/work event can reactivate a settled non-cron chat. Merely opening it, passive polling of the same running task, message-count growth, ongoing tool starts and completion cannot undo a manual Settle. Turning Inbox Off, changing connection/profile, unmounting or hot-reloading clears the temporary notice, not saved settlement.

**Snooze** hides a thread until a chosen deadline, without stopping its task or changing its pin, history or settled state. The left clock opens a theme-aware dropdown containing **In 1 hour**, **In 3 hours**, **Tomorrow** and **Next week**, with local wake times. Tomorrow is 09:00 on the next calendar day; Next week is 09:00 next Monday. A choice applies immediately after verified saving. Clicking outside or pressing Escape dismisses the menu; arrow keys, Home/End, Enter/Space and Tab remain supported. Existing saved deadlines are preserved. Opening a chat, background activity and hydration do not shorten them. A **Snoozed** badge on an admitted, verified row in Sessions or Pinned shows the deadline on hover and offers **Wake now** to cancel early. Expiry or badge cancellation restores an otherwise active admitted non-cron thread to Inbox without navigating.

**Snoozed N** is a collapsible group below Working, initially collapsed and absent when empty. Opening one of its threads does not cancel Snooze. The right-hand upward-arrow **Cancel snooze** action returns it to Inbox or Working according to activity and then opens it through its verified owner. The clock slot remains reserved but inactive while snoozed. Expiry restores attention without navigating.

Native row badges require a verified single connection/profile and a matching admitted thread. The current Desktop row slot exposes a durable ID but not its owner, so badges remain hidden in mixed-connection/profile lists rather than act on the wrong thread. Un-settle and Wake now remain available on verified row badges; no separate restore commands clutter the command palette. Known cron sessions are excluded even if an old admission or attention record exists.

Settling or snoozing the current thread opens the next Inbox thread, or a new chat if none remains in the loaded list. Acting on another thread does not navigate. Inbox scrolls without manual pagination controls. Previously work-admitted threads remain available even beyond the first history page. When Inbox only is Off, Pinned and Sessions stay below Inbox, including when expanded; neither section must be closed to expose Inbox. Turning Inbox Off hides its groups and badges without erasing settled state or snooze deadlines. The independent Inbox only preference can still hide the native lists until it is also turned Off.

**Snooze** is on the left and **Settle** on the right, both shown on hover or keyboard focus. Two reserved 24px slots keep titles stable. Disabled Settle is hidden, not a promise of a complete native context menu. Real work uses a theme-accent dot and the installed Hermes segmented contour around the whole row, not a rotating arc around the dot. Questions and approval requests show an amber Needs input dot instead of the working contour. Idle, reading and unknown activity states show no activity indicator. A successful terminal reply or the native unread marker produces the green completed dot; errors, interruptions and missing live status do not imply success. A parent handoff while observed subagents remain active also does not imply completion. Activity events require the exact source/profile and a verified stored/runtime identity; replayed and foreign-owner events are ignored. Reduced-motion keeps the working marker and a static contour.

Viewing the latest completed reply clears its green completion dot without settling the chat or removing it from Inbox. Reading an earlier reply does not clear a newer one. Completed/read receipts persist locally across refreshes, connection/profile changes and plugin reloads; a metadata refresh alone does not acknowledge a reply. Fresh work or positively newer unread evidence re-arms the indicator. Failed read-receipt writes keep the completion indicator visible and are retried on later updates.

Session listing uses Hermes' native endpoint and follows its configured retention policy. Settle and Snooze themselves write only the plugin's local state and never archive a session.

After startup or reconnect, previously admitted threads become available progressively as their ownership is verified. Inbox no longer waits for every background activity check before showing those threads. Unverified chats remain excluded, and Settle and Snooze still apply. Settle waits until the current activity snapshot is complete, even when threads are already visible. Expanding Working also keeps the gap below Inbox stable when Pinned or Sessions is open.

On later refreshes, already-admitted rows can remain displayed during incremental revalidation rather than disappearing until every detail read finishes. These retained rows are presentation-only; required fresh verification still gates actions. Archived, cron or changed-lineage results can revoke a retained row as soon as that result resolves. Backend-qualified ownership separates retargeted remote routes and colliding durable IDs. Ambiguous old alias-only state is preserved rather than silently adopted, and route/mode changes revoke delayed callbacks and retained action handles.

Admission v2 keeps the old v1 admission store untouched as a backup but does not automatically promote its ambiguous creation/open/work entries. All existing Settle/Snooze records and aliases remain intact. A fresh verified non-cron work observation can admit such a thread; a previous manual Settle or active Snooze still applies. This is work-based admission, not an original-human-creator filter. Unknown source kinds require compatibility review before admission.

**Known limitation:** cron sessions are excluded, but cron-triggered work delivered into a regular chat may still appear as that chat's activity when Hermes does not expose its origin.

