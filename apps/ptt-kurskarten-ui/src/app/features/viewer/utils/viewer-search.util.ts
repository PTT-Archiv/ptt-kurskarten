export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .trim();
}

export function nodeSearchTerms(
  node: { id: string; name: string },
  aliasesById: Record<string, string[]>
): string[] {
  const canonical = normalizeSearch(node.name);
  const aliases = (aliasesById[node.id] ?? [])
    .map((alias) => normalizeSearch(alias))
    .filter((alias) => alias && alias !== canonical);
  return [canonical, ...aliases];
}
