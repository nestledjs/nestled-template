import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { promises as dns } from 'node:dns'
import disposableDomains from 'disposable-email-domains'
import wildcardDomains from 'disposable-email-domains/wildcard.json'

/**
 * Rejects addresses we should never send mail to — throwaway domains and domains with no mail
 * exchanger — BEFORE the verification email goes out.
 *
 * These checks describe the domain, not the account, so their messages are deliberately specific:
 * they leak nothing about who is registered and a real user needs to know why they were turned away.
 */
@Injectable()
export class EmailHygieneService {
  private readonly logger = new Logger(EmailHygieneService.name)
  private readonly exactDomains = new Set<string>(disposableDomains)

  constructor(private readonly config: ConfigService) {}

  async assertUsableForSignup(email: string): Promise<void> {
    const domain = extractDomain(email)
    if (!domain) {
      throw new BadRequestException('Enter a valid email address.')
    }

    if (this.config.get<boolean>('signupProtection.blockDisposable') && this.isDisposable(domain)) {
      throw new BadRequestException(
        'Disposable email addresses are not accepted. Please use a permanent address.',
      )
    }

    if (
      this.config.get<boolean>('signupProtection.requireMx') &&
      !(await this.acceptsMail(domain))
    ) {
      throw new BadRequestException(
        `We could not find a mail server for "${domain}". Please check the address for typos.`,
      )
    }
  }

  isDisposable(domain: string): boolean {
    if (this.exactDomains.has(domain)) return true
    return wildcardDomains.some(suffix => domain === suffix || domain.endsWith(`.${suffix}`))
  }

  /**
   * True when the domain publishes an MX record, or — per the RFC 5321 §5.1 implicit-MX rule — an
   * address record that mail can fall back to. The A/AAAA fallback matters: some small legitimate
   * domains skip MX entirely, and a false rejection at signup costs a real customer.
   *
   * Fails OPEN on resolver trouble (timeout, SERVFAIL) and CLOSED only on an authoritative
   * "this domain has no records". A DNS outage must not take registration down with it.
   */
  private async acceptsMail(domain: string): Promise<boolean> {
    const timeoutMs = this.config.get<number>('signupProtection.mxTimeoutMs') ?? 3000

    try {
      return await withTimeout(resolveAcceptsMail(domain), timeoutMs)
    } catch (error) {
      if (isNoSuchDomain(error)) return false
      this.logger.warn(
        `MX lookup for "${domain}" failed open: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
      return true
    }
  }
}

const NO_SUCH_DOMAIN_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN'])

const isNoSuchDomain = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException)?.code
  return typeof code === 'string' && NO_SUCH_DOMAIN_CODES.has(code)
}

const extractDomain = (email: string): string | null => {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
}

/** Runs a DNS lookup, treating an authoritative "no such records" as an empty result. */
const lookup = <T>(work: Promise<T[]>): Promise<T[]> =>
  work.catch(error => {
    if (isNoSuchDomain(error)) return []
    throw error
  })

const resolveAcceptsMail = async (domain: string): Promise<boolean> => {
  const mx = await lookup(dns.resolveMx(domain))
  if (mx.some(record => record.exchange?.trim())) return true

  // No usable MX — fall back to the implicit-MX address lookup before rejecting. Check AAAA as
  // well as A: an IPv6-only domain is rare, but rejecting one turns a real customer away at the
  // door, and the lookup is cheap next to the round trip already spent.
  const [v4, v6] = await Promise.all([lookup(dns.resolve4(domain)), lookup(dns.resolve6(domain))])
  return v4.length > 0 || v6.length > 0
}

const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DNS lookup timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([work, expiry])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
