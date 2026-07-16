// `disposable-email-domains` ships plain JSON with no bundled types. Both entry points are flat
// arrays of lowercase domain strings: `index.json` holds exact matches, `wildcard.json` holds
// suffixes that also match any subdomain.
declare module 'disposable-email-domains' {
  const domains: string[]
  export default domains
}

declare module 'disposable-email-domains/wildcard.json' {
  const domains: string[]
  export default domains
}
