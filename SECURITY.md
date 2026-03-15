# Security Policy

## Scope

This policy covers security vulnerabilities in the following packages within the Cesteral MCP Servers repository:

- `@cesteral/shared` -- shared types, utilities, and authentication
- `@cesteral/dbm-mcp` -- Bid Manager (DBM)
- `@cesteral/dv360-mcp` -- Display & Video 360
- `@cesteral/ttd-mcp` -- The Trade Desk
- `@cesteral/gads-mcp` -- Google Ads
- `@cesteral/meta-mcp` -- Meta Marketing
- `@cesteral/linkedin-mcp` -- LinkedIn Marketing
- `@cesteral/tiktok-mcp` -- TikTok Marketing
- `@cesteral/cm360-mcp` -- Campaign Manager 360
- `@cesteral/sa360-mcp` -- Search Ads 360
- `@cesteral/pinterest-mcp` -- Pinterest Ads
- `@cesteral/snapchat-mcp` -- Snapchat Ads
- `@cesteral/amazon-dsp-mcp` -- Amazon DSP
- `@cesteral/msads-mcp` -- Microsoft Advertising

## Reporting Process

If you discover a security vulnerability, please report it responsibly by emailing **security@cesteral.com**. Do not open a public GitHub issue for security vulnerabilities.

Include the following in your report:

- **Server affected**: which package(s) the vulnerability applies to
- **Description**: a clear explanation of the vulnerability
- **Reproduction steps**: detailed steps to reproduce the issue
- **Impact assessment**: your understanding of the potential impact (e.g., unauthorized access, data exposure, privilege escalation)

Please provide as much detail as possible to help us understand and resolve the issue quickly.

## Response Timeline

- **48 hours** -- We will acknowledge receipt of your report.
- **7 days** -- We will complete an initial triage and provide an assessment of severity.
- **30 days** -- We will target a fix for confirmed vulnerabilities.

Timelines may vary depending on complexity, but we will keep you informed of progress throughout.

## Out of Scope

The following are not covered by this security policy:

- **Third-party dependencies**: vulnerabilities in upstream libraries or APIs should be reported directly to those maintainers.
- **Social engineering**: phishing, pretexting, or other social engineering attacks against contributors or maintainers.
- **Denial of service (DoS)**: volumetric or resource exhaustion attacks against running instances.

## Coordinated Disclosure Policy

We follow a 90-day coordinated disclosure timeline. Upon receiving a valid report:

1. We will work with the reporter to understand and validate the issue.
2. We will develop and test a fix within the disclosure window.
3. We will publish the fix and a security advisory simultaneously.
4. If 90 days elapse without a fix, the reporter may disclose the vulnerability publicly.

We ask that reporters refrain from public disclosure until either a fix is released or the 90-day window has passed.

## Credit

We believe in recognizing the contributions of security researchers. Contributors who report valid vulnerabilities will be credited in the corresponding release notes, unless they prefer to remain anonymous. Please indicate your preference when submitting your report.
