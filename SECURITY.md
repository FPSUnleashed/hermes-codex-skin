# Security Policy

## Supported versions

Security fixes are applied to the latest stable release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository when available. Otherwise, open a minimal issue asking for a private contact path without publishing exploit details, credentials or private conversation data.

## Trust model

Hermes Desktop loads local plugins into the renderer with full app authority. Plugin loading provides error isolation, not a security sandbox. Review the source and verify the published SHA-256 before installation.

Codex Skin has no separate backend and does not modify Hermes source files. It does make network requests for updates and release-history images, and it uses Hermes' native session APIs for Inbox and history previews.

## Network requests

- **Release metadata:** on supported Desktop builds, the public stable updater contacts the GitHub API for `FPSUnleashed/hermes-codex-skin` on launch, hourly, and when stale information needs refreshing on app activation or reconnection. Browsing older release notes can fetch additional pages.
- **Release images:** opening the update menu can load HTTPS images whose initial URLs match this repository's GitHub release assets/raw paths or GitHub-hosted user attachments. Other initial URLs are rejected; final redirect destinations and image file types are not separately checked. Supported Markdown images and HTML `img` elements become plugin-created image elements; other release-note HTML and release-supplied event handlers are not executed.
- **Plugin asset:** downloading and installing the selected `plugin.js` release asset requires the user's update click. Checking for availability does not install code.

No GitHub account is required for the public stable channel. Its fetch requests omit browser credentials and referrers and add no authorization token; release images use a no-referrer policy. GitHub receives ordinary request metadata, such as IP address and user agent. No chat content is sent to GitHub, and the plugin adds no analytics.

Inbox and history previews request session information through Hermes' own APIs. Those requests follow the user's Hermes connection and its authority; they are distinct from the GitHub update feed.

## Verification before replacement and hot reload

The updater:

1. Selects a newer stable release from the configured public repository and checks the asset URL, declared size and SHA-256 digest.
2. Enforces a download-size limit and rejects a byte-count or digest mismatch.
3. Checks that the downloaded source declares the expected plugin identity and release build version.
4. Resolves the local Desktop plugin folder, verifies a staged copy and saves a verified rollback copy before replacing `plugin.js`.
5. Reads back the installed file and requires the new plugin to verify its build and digest after hot reload before reporting success.

If replacement or activation fails, the updater attempts to restore the verified previous file. When restoration cannot be verified, it retains the recovery receipt and rollback copy and reports an error instead of success. Replacement uses a direct file write, not an atomic rename; recovery is not guaranteed after a crash or storage failure. In-app updates require Desktop's local file and hot-reload capabilities; a remote Agent update alone does not provide them.

**These are integrity and consistency checks, not independent publisher authentication.** The expected digest comes from GitHub release metadata. There is no separate signing key or signature-verification step. The repository's publishing authority and GitHub remain trusted; a valid digest does not prove downloaded code is harmless. A user-clicked update replaces the local plugin with the chosen release, not necessarily the revision originally installed from a repository pin.

For a manual installation, compare the downloaded file with `CHECKSUMS.sha256` from the same tag or exact source revision, not a moving branch's checksums.

## Local data

The plugin persists skin preferences, a bounded list of identifiers for manually expanded user messages, and Inbox state keyed by connection, profile and durable thread identity. Inbox records include admission, aliases, Settle/Snooze state and activity/message-count watermarks.

The updater caches release notes and check times, records pending/completed update verification receipts, and writes staged/rollback plugin files. These files contain plugin code, not chat history.

The plugin does not persist message text, prompt hashes or content-derived fingerprints. History previews can read and display message text from Hermes without saving it in the plugin's persistent state.
