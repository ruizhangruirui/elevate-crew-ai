export type ScopeNode = { id: string; name: string; type: string; parent_id: string | null };

/** Lab containing the node (walks up parents); null if none. */
export function labOf(nodes: ScopeNode[], nodeId: string | null | undefined): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = nodeId ? byId.get(nodeId) : undefined;
  for (let i = 0; cur && i < 20; i++) {
    if (cur.type === "Lab") return cur.id;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

/** IDs of the given roots plus all descendants. */
export function subtree(nodes: ScopeNode[], roots: string[]): Set<string> {
  const out = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) if (n.parent_id && out.has(n.parent_id) && !out.has(n.id)) { out.add(n.id); grew = true; }
  }
  return out;
}

/** Nodes of the HR team(s): names containing the word "HR". */
export function hrNodes(nodes: ScopeNode[]): Set<string> {
  return subtree(nodes, nodes.filter((n) => /\bHR\b/i.test(n.name)).map((n) => n.id));
}
