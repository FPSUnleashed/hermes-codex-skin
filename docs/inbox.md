# Inbox design and behavior

[Back to the README](../README.md)

This note describes Inbox in Codex Skin v1.10.0. It keeps the detailed admission, ownership and attention-state rules out of the installation guide.


Open the command palette and run **Codex Skin: Inbox** to switch it On or Off. The preference persists locally; a missing preference defaults to On.

#### How to use it

Think of each thread as an independent task.

Once it's finished, click the **checkmark** to remove it from Inbox. **It isn't archived**, only hidden from Inbox. You can still find it in Sessions.

The goal is to have **an empty Inbox at the end of the day**.

Inbox is **enabled by default**, but you can turn it off whenever you want: open the command palette and select **Codex Skin: Inbox**.

I recommend keeping **Pinned** and **Sessions** collapsed so you can focus on your Inbox. Expand them whenever you need to find an older or pinned chat.

Inbox opens by default above Pinned and Sessions. Its heading and disclosure match the native sections. A chat enters Inbox when fresh, owner-verified agent work is observed, even in an older chat. Cron sessions never enter Inbox: the filter uses Hermes' session `source` and, when present, immutable `created_source`, not titles or IDs. Known non-cron sources may differ when a chat moves between interfaces; missing or unknown provenance and conflicting ownership stay excluded. Creating an empty chat, opening or focusing a chat, reading history, pagination, unread marks and timestamps do not admit it. Admitted non-cron threads remain after work completes until **Settle**; **Snooze** hides them temporarily. Admission persists separately for each connection and profile, including threads older than the recent history page. Disconnected, stale or failed live reads cannot admit new work.

**Settle** removes a thread from Inbox without stopping work, archiving, deleting or unpinning it. A **Settled** badge on an already admitted, verified native session row offers **Un-settle** on hover or keyboard focus. The Settle check stays available on every admitted Inbox row, including while working, waiting for input, reading history, or when activity or metadata is unavailable. A compact **Settled** notice below the remaining threads offers **Undo** for **3000 ms**, with a theme-aware left-to-right progress bar. Only the latest successful settlement has a notice and Undo handle; earlier settlements remain saved. Undo restores that exact thread's attention without navigating. Failed storage writes do not hide the row or show a success notice. A subsequent verified new message/work event can reactivate a settled non-cron chat. Merely opening it, passive polling of the same running task, message-count growth, ongoing tool starts and completion cannot undo a manual Settle. Turning Inbox Off, changing connection/profile, unmounting or hot-reloading clears the temporary notice, not saved settlement.

**Snooze** hides a thread from Inbox until a chosen deadline, without stopping its task or changing its pin, history or settled state. The clock button opens a theme-aware dropdown containing only 15 minutes, 30 minutes, 1 hour, 3 hours and 1 day. Choosing a duration applies it immediately; clicking outside or pressing Escape dismisses the menu. The deadline persists locally across reloads. Opening a chat, background activity and hydration do not shorten it. A **Snoozed** badge on an admitted, verified row in Sessions or Pinned shows the deadline on hover and offers **Wake now** to cancel early. Expiry or cancellation restores an otherwise active admitted non-cron thread to Inbox without navigating.

Native row badges require a verified single connection/profile and a matching admitted thread. The current Desktop row slot exposes a durable ID but not its owner, so badges remain hidden in mixed-connection/profile lists rather than act on the wrong thread. Un-settle and Wake now remain available on verified row badges; no separate restore commands clutter the command palette. Known cron sessions are excluded even if an old admission or attention record exists.

Settling or snoozing the current thread opens the next Inbox thread, or a new chat if none remains in the loaded list. Acting on another thread does not navigate. Inbox scrolls without manual pagination controls. Previously work-admitted threads remain available even beyond the first history page. Pinned and Sessions stay below Inbox, including when expanded; neither section must be closed to expose Inbox. Turning Inbox Off restores native section controls and hides the Inbox badges without erasing settled state or snooze deadlines.

**Snooze** is on the left and appears only on hover or keyboard focus. The **Settle** check is on the right and stays visible at rest regardless of activity; its reserved slot keeps the title and Snooze in place. Real work uses a theme-foreground dot and the installed Hermes segmented contour around the whole row, not a rotating arc around the dot. Idle, reading and unknown activity states show no activity indicator. A successful terminal reply or the native unread marker produces the green completed dot; errors, interruptions and missing live status do not imply success. A parent handoff while observed subagents remain active also does not imply completion. Activity events require the exact source/profile and a verified stored/runtime identity; replayed and foreign-owner events are ignored. Reduced-motion keeps the working marker and a static contour.

Viewing the latest completed reply clears its green completion dot without settling the chat or removing it from Inbox. Reading an earlier reply does not clear a newer one. Fresh work re-arms the indicator for the next completion.

Session listing uses Hermes' native endpoint and follows its configured retention policy. Settle and Snooze themselves write only the plugin's local state and never archive a session.

Admission v2 keeps the old v1 admission store untouched as a backup but does not automatically promote its ambiguous creation/open/work entries. All existing Settle/Snooze records and aliases remain intact. A fresh verified non-cron work observation can admit such a thread; a previous manual Settle or active Snooze still applies. This is work-based admission, not an original-human-creator filter. Unknown source kinds require compatibility review before admission.

**Known limitation:** cron sessions are excluded, but cron-triggered work delivered into a regular chat may still appear as that chat's activity when Hermes does not expose its origin.

