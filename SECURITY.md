# Security Policy

## Supported Versions

Only the latest stable release receives security fixes.

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
| Older   | No        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security concerns privately via [GitHub's private vulnerability reporting](https://github.com/VacantFanatic/sla-foundry/security/advisories/new).

Include as much of the following as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected version(s)
- Any suggested fix or mitigation

You should receive an acknowledgement within **7 days**. If you do not hear back, follow up by email at the address listed on the maintainer's GitHub profile.

## Scope

This is an unofficial fan-made **Foundry VTT game system** (client-side JavaScript, Handlebars templates, and SCSS). It runs entirely within a Foundry VTT server that the GM hosts. Relevant security concerns include:

- Cross-site scripting (XSS) via user-supplied HTML in actor/item fields
- Privilege escalation within Foundry's permission model
- Data leakage between players via the system's socket or API calls

Out of scope: vulnerabilities in Foundry VTT core, Node.js, or the host OS. Report those to [Foundry VTT](https://foundryvtt.com/article/reporting-issues/) or the relevant upstream project.

## Disclosure

Once a fix is released, the vulnerability will be documented in [CHANGELOG.md](CHANGELOG.md) and credited to the reporter (unless anonymity is requested).
