import type { ActionItem } from "./actions";

export function actionTarget(action: ActionItem) {
  if ((action.source_kind === "reference" || action.source_kind === "reference_review") && action.source_key) {
    return { kind: "reference" as const, id: action.source_key };
  }
  const roleId = action.role_id ?? (action.source_kind === "position_approval" ? action.source_key : null);
  if (roleId) return { kind: "position" as const, id: roleId };
  if (action.person_id) return { kind: "person" as const, id: action.person_id };
  return null;
}