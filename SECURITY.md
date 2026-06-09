# Security Policy — Policy Hub (Chubb APAC)

## Supported Versions

| Version | Supported |
|---|---|
| `main` (latest) | ✅ Active |
| Any tagged release | ✅ Until superseded |
| Older branches | ❌ No security support |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues privately by emailing the project maintainer. Include:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact assessment
4. Any suggested remediation (optional)

You will receive acknowledgement within **2 business days** and a resolution timeline within **5 business days**.

---

## Security Design Principles

This project applies the following security controls aligned with the **OWASP Top 10**.

### A01 — Broken Access Control
- No authentication is in scope for the current phase (internal dashboard)
- All HTTP calls target the same-origin mock API; no cross-origin credentials are sent

### A02 — Cryptographic Failures
- No sensitive data (PII, credentials, tokens) is stored in `localStorage`
- The only persisted value is the user's theme preference (`policy-hub-theme`)
- All production traffic must be served over HTTPS (enforced at the infrastructure layer)

### A03 — Injection
- Angular's template engine auto-escapes all bound expressions — no `innerHTML` usage
- `HttpClient` URL-encodes all query parameters — no manual string concatenation in URLs
- All API response data is typed through TypeScript interfaces — no `eval()` or dynamic code execution

### A05 — Security Misconfiguration
- `errorInterceptor` strips server error messages for all 5xx responses — internal stack traces are never surfaced to the UI
- `LoggerService` suppresses `debug` and `info` output in production — no internal state leaks to the browser console

### A06 — Vulnerable and Outdated Components
- Run `npm audit` after every dependency installation
- Keep Angular, Angular Material, and all dependencies on the latest minor/patch
- Review `npm audit` output as part of every PR that touches `package.json`

### A09 — Security Logging and Monitoring Failures
- `LoggerService.error()` is always active in production
- Future: errors will be forwarded to a remote monitoring service (e.g. Azure Application Insights) from `LoggerService.error()`

### A10 — Server-Side Request Forgery (SSRF)
- The Angular SSR server does not make server-side HTTP calls to external URLs on behalf of the client
- All API calls are made by the browser after hydration

---

## Dependency Security

```bash
# Audit for known vulnerabilities
npm audit

# Upgrade all dependencies to latest compatible versions
npm update

# Check for outdated packages
npm outdated
```

Any `npm audit` finding at `high` or `critical` severity must be resolved before merging to `main`.
