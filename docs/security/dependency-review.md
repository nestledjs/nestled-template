# Dependency Review

Dependencies added to this template become part of every downstream project's inherited risk. Review
new dependencies before adding them, especially in auth, crypto, sessions, billing, storage, request
parsing, code generation, and build tooling.

## Minimum Review

- Prefer framework-owned, widely adopted, maintained packages over niche alternatives.
- Check release recency, issue activity, maintainer identity, license, and package provenance.
- Avoid packages that execute install scripts unless there is a clear need and review path.
- Avoid adding dependencies for trivial code that can be maintained locally.
- For auth, crypto, token, and session behavior, use established libraries and document why the
  chosen package is appropriate.

## CI And Release Checks

- `pnpm audit` should be run before release and before publishing downstream updates.
- Release automation should generate an SBOM once the release packaging flow is finalized.
- Critical and high vulnerabilities in runtime dependencies should block release unless documented
  as non-exploitable for this template.

## Future Automation

The target release flow should produce an SBOM artifact and retain it with release metadata. That is
post-clone automation work; this document is the pre-clone policy baseline.
