# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/nestledjs/nestled-dev-template/security/advisories/new)**

Only the maintainers can see the report. We'll confirm receipt, work on a fix in a private fork, release
it, and then publish an advisory. The advisory describes the problem and the fix in general terms.

## What to include

- The affected release (the template release: `baselineRelease` in your project's `.nestled/upgrade-log.yaml`, or `.nestled/template-version` if it has never run `nestled-update`; for example 2026.10.1) and the component involved.
- Steps to reproduce, ideally on a fresh clone or a minimal example.
- The impact as you understand it.

**Leave out anything that identifies your own deployment:** your project, organization, client or site
names, URLs, credentials, and links to private repositories. We don't need them to fix the problem, and
advisories are eventually public.

## Scope

The Nestled template: the code in nestled-dev-template, published as nestled-template and as the `@nestledjs/data-browser`, `@nestledjs/shared-components` and `@nestledjs/access-control` packages.
