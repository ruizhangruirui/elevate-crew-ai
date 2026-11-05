type HierarchyNode = {
  id: string;
  parent_id: string | null;
  type: string;
  archived: boolean;
};

/** A Lab remains available as a Team parent regardless of its existing children. */
export function organizationParents<T extends HierarchyNode>(nodes: T[], type: string, editingId?: string): T[] {
  const excluded = new Set<string>();
  if (editingId) {
    const visit = (id: string) => {
      if (excluded.has(id)) return;
      excluded.add(id);
      nodes.filter((node) => node.parent_id === id).forEach((node) => visit(node.id));
    };
    visit(editingId);
  }
  // The top node may use any type label (e.g. "Research Center"), so roots are identified by having no parent.
  const roots = new Set(nodes.filter((node) => !node.parent_id).map((node) => node.id));
  return nodes.filter((node) => !node.archived && !excluded.has(node.id) &&
    (type === "Lab" ? roots.has(node.id)
      : type === "Team" ? roots.has(node.id) || node.type === "Lab" || (node.type === "Team" && !!node.parent_id && roots.has(node.parent_id))
      : true));
}