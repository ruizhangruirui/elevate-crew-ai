type OverviewRole = { id: string; org_node_id?: string | null };
type OverviewCandidate = { role_id: string; outcome: string };
type OverviewNode = { id: string; parent_id: string | null; type: string };

export function teamForRole(nodeId: string | null | undefined, nodes: readonly OverviewNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  let node = nodeId ? byId.get(nodeId) : undefined;
  while (node && !visited.has(node.id)) {
    if (node.type.toLowerCase() === "team") return node.id;
    visited.add(node.id);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  return null;
}

export function overviewCandidates<T extends OverviewCandidate>(
  candidates: readonly T[], roles: readonly OverviewRole[], nodes: readonly OverviewNode[],
  team = "all", status = "all",
): T[] {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  return candidates.filter((candidate) => {
    const role = roleById.get(candidate.role_id);
    if (!role || !["offer", "offer_accepted", "to_onboard"].includes(candidate.outcome)) return false;
    if (status !== "all" && candidate.outcome !== status) return false;
    return team === "all" || teamForRole(role.org_node_id, nodes) === team;
  });
}