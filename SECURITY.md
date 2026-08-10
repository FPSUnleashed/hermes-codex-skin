# Security Policy

## Supported versions

Security fixes are applied to the latest stable release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository when available. Otherwise, open a minimal issue asking for a private contact path without publishing exploit details, credentials or private conversation data.

## Trust model

Hermes Desktop loads local plugins into the renderer with full app authority. Plugin loading provides error isolation, not a security sandbox. Review the source and verify the published SHA-256 before installation.

The current plugin has no backend, performs no network requests and loads no external assets.
