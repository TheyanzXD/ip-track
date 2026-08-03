// lib/schemas.js — response schema source of truth (TODO 19)
const ipItem = {
  type: 'object',
  required: ['ip'],
  properties: {
    ip: { type: 'string' },
    country: { type: 'string' },
    region: { type: 'string' },
    city: { type: 'string' },
    isp: { type: 'string' },
    organization: { type: 'string' },
    asn: { type: 'string' },
    timezone: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    mobile: { type: 'boolean' },
    proxy: { type: 'boolean' },
    hosting: { type: 'boolean' },
    reverseDns: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    threat: {
      type: 'object',
      properties: {
        isTor: { type: 'boolean' },
        isVpn: { type: 'boolean' },
        isDatacenter: { type: 'boolean' },
        isAbuser: { type: 'boolean' },
        score: { type: 'number' }
      }
    }
  }
};

export const schemas = {
  ip: {
    type: 'object',
    required: ['ip', 'meta'],
    properties: {
      ...ipItem.properties,
      queriedIp: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      meta: {
        type: 'object',
        required: ['provider', 'cached', 'elapsedMs'],
        properties: {
          provider: { type: 'string' },
          cached: { type: 'boolean' },
          elapsedMs: { type: 'number' },
          accuracyRadius: { type: 'number' },
          source: { type: 'string' }
        }
      }
    }
  },
  dns: {
    type: 'object',
    required: ['domain'],
    properties: {
      domain: { type: 'string' },
      resolvers: {
        type: 'object',
        properties: {
          cloudflare: { type: 'object' },
          google: { type: 'object' },
          quad9: { type: 'object' }
        }
      },
      records: { type: 'object' },
      dnssec: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['validated', 'secure', 'bogus', 'insecure', 'none', 'unknown'] },
          ad: { type: 'boolean' },
          details: { type: 'string' }
        }
      },
      resolverDiff: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            values: { type: 'array', items: { type: 'string' } },
            differs: { type: 'boolean' }
          }
        }
      },
      flags: {
        type: 'object',
        properties: {
          homograph: { type: 'boolean' },
          punycode: { type: 'boolean' },
          suspicious: { type: 'boolean' }
        }
      },
      errors: { anyOf: [{ type: 'object' }, { type: 'null' }] }
    }
  },
  headers: {
    type: 'object',
    required: ['url', 'statusCode'],
    properties: {
      url: { type: 'string' },
      finalUrl: { type: 'string' },
      statusCode: { type: 'integer' },
      statusMessage: { type: 'string' },
      httpVersion: { type: 'string' },
      headers: { type: 'object' },
      redirectChain: { type: 'array', items: { type: 'object' } },
      redirectCount: { type: 'integer' },
      securityScore: { type: 'integer' },
      durationMs: { type: 'number' }
    }
  },
  portscan: {
    type: 'object',
    required: ['host', 'totalScanned'],
    properties: {
      host: { type: 'string' },
      totalScanned: { type: 'integer' },
      open: { type: 'integer' },
      filtered: { type: 'integer' },
      closed: { type: 'integer' },
      durationMs: { type: 'number' },
      scanId: { type: 'string' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          required: ['port', 'status'],
          properties: {
            port: { type: 'integer' },
            status: { type: 'string', enum: ['open', 'closed', 'filtered'] },
            service: { type: 'string' },
            banner: { anyOf: [{ type: 'string' }, { type: 'null' }] }
          }
        }
      }
    }
  },
  ssl: {
    type: 'object',
    required: ['host', 'score'],
    properties: {
      host: { type: 'string' },
      port: { type: 'integer' },
      protocol: { type: 'string' },
      authorized: { type: 'boolean' },
      cipher: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' }
        }
      },
      certificate: { type: 'object' },
      chain: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'object' },
            issuer: { type: 'object' },
            validFrom: { type: 'string' },
            validTo: { type: 'string' },
            verified: { type: 'boolean' }
          }
        }
      },
      ocsp: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['good', 'revoked', 'unknown', 'unavailable'] },
          responder: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          detail: { anyOf: [{ type: 'string' }, { type: 'null' }] }
        }
      },
      tlsVersions: {
        type: 'object',
        properties: {
          '1.0': { type: 'boolean' },
          '1.1': { type: 'boolean' },
          '1.2': { type: 'boolean' },
          '1.3': { type: 'boolean' }
        }
      },
      ciphers: { type: 'array', items: { type: 'object' } },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      scoreBreakdown: { type: 'object' },
      checkedAt: { type: 'string' }
    }
  },
  whois: {
    type: 'object',
    required: ['target'],
    properties: {
      target: { type: 'string' },
      kind: { type: 'string', enum: ['domain', 'ip', 'asn'] },
      source: { type: 'string', enum: ['rdap', 'whois-iana', 'whois-server'] },
      registrar: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      creationDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      expiryDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      updatedDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      nameservers: { type: 'array', items: { type: 'string' } },
      status: { type: 'array', items: { type: 'string' } },
      abuseEmail: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      registrant: { anyOf: [{ type: 'object' }, { type: 'null' }] },
      dnssec: { type: 'boolean' },
      raw: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      meta: { type: 'object' }
    }
  },
  ct: {
    type: 'object',
    required: ['domain'],
    properties: {
      domain: { type: 'string' },
      source: { type: 'string', enum: ['crt.sh', 'certspotter', 'crt.sh,certspotter'] },
      totalCertificates: { type: 'integer' },
      subdomains: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            wildcard: { type: 'boolean' },
            issuers: { type: 'array', items: { type: 'string' } },
            firstSeen: { type: 'string' },
            lastSeen: { type: 'string' }
          }
        }
      },
      timeline: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            month: { type: 'string' },
            count: { type: 'integer' }
          }
        }
      },
      meta: { type: 'object' }
    }
  },
  scan: {
    type: 'object',
    required: ['jobId'],
    properties: {
      jobId: { type: 'string' },
      tool: { type: 'string' },
      status: { type: 'string', enum: ['created', 'queued', 'running', 'partial', 'done', 'failed', 'aborted'] },
      total: { type: 'integer' },
      done: { type: 'integer' },
      ok: { type: 'integer' },
      errors: { type: 'integer' },
      etaSec: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      results: { type: 'array' }
    }
  },
  share: {
    type: 'object',
    required: ['code'],
    properties: {
      code: { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{8}$' },
      url: { type: 'string' },
      expiresAt: { type: 'string' }
    }
  },
  ai: {
    type: 'object',
    required: ['summary'],
    properties: {
      summary: { type: 'string' },
      model: { type: 'string' },
      cached: { type: 'boolean' },
      tool: { type: 'string' }
    }
  },
  health: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ok', 'degraded'] },
      uptimeSec: { type: 'number' },
      memory: { type: 'object' },
      checks: { type: 'array' }
    }
  }
};

export default schemas;
