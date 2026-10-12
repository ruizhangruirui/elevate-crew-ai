import type { Person } from "./talent";

type Node = { id: string; parent_id: string | null; type: string; name: string };

/** Leaders (is_leader) placed directly on a node, onboard and not archived. */
export function leadersOf(nodeId: string, people: Person[]): Person[] {
  return people.filter(
    (p) => p.org_node_id === nodeId && p.is_leader && p.status !== "left" && !p.archived,
  );
}

/**
 * Supervisor: a manual override (people.supervisor_id) wins; otherwise the
 * leader of the person's own node (Team Lead), and for a leader — or a node
 * without one — the leader of the parent node (Lab Director), walking upward.
 */
export function supervisorOf(person: Person, people: Person[], nodes: Node[]): Person | null {
  if (person.supervisor_id) {
    const manual = people.find((p) => p.id === person.supervisor_id);
    if (manual) return manual;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = person.org_node_id ? byId.get(person.org_node_id) : undefined;
  while (cur) {
    const leads = leadersOf(cur.id, people).filter((p) => p.id !== person.id);
    const selfLeads = person.is_leader && person.org_node_id === cur.id;
    if (leads.length && !selfLeads) return leads[0]!;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}
