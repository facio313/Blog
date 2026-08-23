export interface RedactionResult {
  content: string
  reasons: string[]
}

interface RedactionRule {
  reason: string
  pattern: RegExp
  replace: (match: string, ...groups: string[]) => string
}

const marker = '[REDACTED BY IMPORTER]'

const rules: RedactionRule[] = [
  {
    reason: 'credential-like ngrok token',
    pattern: /(ngrok(?:\.exe)?\s+(?:config\s+add-)?authtoken\s+)([A-Za-z0-9_-]{20,})/gi,
    replace: (_match, prefix) => `${prefix}${marker}`,
  },
  {
    reason: 'credential in connection URL',
    pattern: /((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)?:\/\/[^\s/:@]+:)([^\s@/]+)(@)/gi,
    replace: (_match, prefix, _secret, suffix) => `${prefix}${marker}${suffix}`,
  },
  {
    reason: 'private key material',
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replace: () => marker,
  },
  {
    reason: 'cloud access key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replace: () => marker,
  },
  {
    reason: 'credential-like assignment',
    pattern:
      /\b(password|passwd|pwd|secret(?:_key)?|api[_-]?key|access[_-]?token|auth[_-]?token)\b(\s*[:=]\s*)(["']?)(?!\[REDACTED BY IMPORTER\])([^\s,"'`;}{]{4,})(\3)/gi,
    replace: (_match, name, separator, quote) => `${name}${separator}${quote}${marker}${quote}`,
  },
]

export function redactSensitiveContent(input: string): RedactionResult {
  let content = input
  const reasons = new Set<string>()

  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    if (!rule.pattern.test(content)) continue
    reasons.add(rule.reason)
    rule.pattern.lastIndex = 0
    content = content.replace(rule.pattern, rule.replace)
  }

  return { content, reasons: [...reasons].sort() }
}
