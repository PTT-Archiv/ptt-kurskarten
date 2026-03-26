import type { GraphAssertion } from '@ptt-kurskarten/shared';

const FACT_LINK_TEMPLATES: Record<string, string> = {
  wikidata: 'https://www.wikidata.org/wiki/{value}',
  mfk: 'https://mfk.rechercheonline.ch/{value}'
};

const FACT_SCHEMA_LINK_PROVIDER: Record<string, string> = {
  'identifier.wikidata': 'wikidata',
  'identifier.mfk': 'mfk',
  'identifier.mfk_permalink': 'mfk',
  'identifier.rechercheonline': 'mfk'
};

export function assertionValueToString(assertion: GraphAssertion): string | null {
  if (assertion.valueType === 'string' && assertion.valueText !== null && assertion.valueText !== undefined) {
    const value = assertion.valueText.trim();
    return value.length ? value : null;
  }
  if (assertion.valueType === 'number' && assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
    return String(assertion.valueNumber);
  }
  if (assertion.valueType === 'boolean' && assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
    return assertion.valueBoolean ? 'true' : 'false';
  }
  if (assertion.valueType === 'json' && assertion.valueJson !== null && assertion.valueJson !== undefined) {
    return JSON.stringify(assertion.valueJson);
  }

  if (assertion.valueText !== null && assertion.valueText !== undefined) {
    const value = assertion.valueText.trim();
    return value.length ? value : null;
  }
  if (assertion.valueNumber !== null && assertion.valueNumber !== undefined) {
    return String(assertion.valueNumber);
  }
  if (assertion.valueBoolean !== null && assertion.valueBoolean !== undefined) {
    return assertion.valueBoolean ? 'true' : 'false';
  }
  if (assertion.valueJson !== null && assertion.valueJson !== undefined) {
    return JSON.stringify(assertion.valueJson);
  }
  return null;
}

export function resolveFactLink(schemaKey: string, rawValue: string): { label: string; url: string | null } {
  const [rawLabel, rawLinkToken] = rawValue.split(';', 2);
  const label = rawLabel?.trim() || rawValue.trim();
  const linkToken = rawLinkToken?.trim() || null;
  const providerFromSchema = resolveFactProviderFromSchemaKey(schemaKey);

  if (linkToken) {
    return {
      label,
      url: resolveFactLinkFromToken(label, linkToken, providerFromSchema)
    };
  }

  return {
    label,
    url: resolveFactLinkFromToken(label, providerFromSchema ?? label, providerFromSchema)
  };
}

export function resolveFactProviderFromSchemaKey(schemaKey: string): string | null {
  const normalized = schemaKey.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return FACT_SCHEMA_LINK_PROVIDER[normalized] ?? null;
}

export function resolveFactLinkFromToken(
  label: string,
  token: string,
  fallbackProvider?: string | null
): string | null {
  if (/^https?:\/\//i.test(token)) {
    return token;
  }
  const provider = token.trim().toLowerCase() || (fallbackProvider?.trim().toLowerCase() ?? '');
  const template = FACT_LINK_TEMPLATES[provider];
  const normalizedValue = normalizeFactLinkValueForProvider(label, provider);
  if (!template) {
    if (/^https?:\/\//i.test(label)) {
      return label;
    }
    return token.includes('{value}') ? token.replace('{value}', normalizedValue ?? label) : null;
  }
  if (!normalizedValue) {
    return null;
  }
  return template.replace('{value}', normalizedValue);
}

export function normalizeFactLinkValueForProvider(value: string, provider: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (provider === 'wikidata') {
    const qid = normalized.match(/Q\d+/i)?.[0];
    return qid ? qid.toUpperCase() : null;
  }
  if (provider === 'mfk') {
    const objectId = normalized.match(/mfkobject:\d+/i)?.[0];
    if (objectId) {
      return objectId.toLowerCase();
    }
    if (/^\d+$/.test(normalized)) {
      return `mfkobject:${normalized}`;
    }
    return normalized;
  }
  return normalized;
}
