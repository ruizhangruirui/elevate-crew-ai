import { mapFields, pickPath, fillPath } from "./datalink";

/**
 * Datalink API adapter. Everything is configured by environment variables on the
 * company server, because the Datalink API contract is maintained by IT.
 */
export function datalinkConfig() {
  const env = process.env;
  const base = (env["DATALINK_API_BASE_URL"] ?? "").replace(/\/+$/, "");
  const key = env["DATALINK_API_KEY"] ?? "";
  let fieldMap: Record<string, string> = {};
  try {
    fieldMap = JSON.parse(env["DATALINK_FIELD_MAP"] || "{}");
  } catch {
    throw new Error("DATALINK_FIELD_MAP is not valid JSON");
  }
  return {
    enabled: !!base && !!key && !!env["DATALINK_SUBMIT_PATH"],
    base,
    key,
    authHeader: env["DATALINK_AUTH_HEADER"] || "Authorization",
    authPrefix: env["DATALINK_AUTH_PREFIX"] ?? "Bearer ",
    submitPath: env["DATALINK_SUBMIT_PATH"] ?? "",
    statusPath: env["DATALINK_STATUS_PATH"] ?? "",
    statusMethod: (env["DATALINK_STATUS_METHOD"] || "GET").toUpperCase(),
    workSpaceId: env["DATALINK_WORKSPACE_ID"] || "Dlink_97046",
    appId: env["DATALINK_APP_ID"] || "13280046",
    formId: env["DATALINK_FORM_ID"] || "DDD283E74AC0496E866348EFBE201CB1",
    idField: env["DATALINK_ID_FIELD"] || "data.id",
    statusField: env["DATALINK_STATUS_FIELD"] || "data.status",
    approverField: env["DATALINK_APPROVER_FIELD"] || "data.currentApprover",
    fieldMap,
  };
}

async function call(path: string, method: string, body?: unknown) {
  const c = datalinkConfig();
  const res = await fetch(`${c.base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [c.authHeader]: `${c.authPrefix}${c.key}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Datalink [${res.status}]: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Datalink returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export async function submitToDatalink(offerId: string, terms: Record<string, unknown>) {
  const c = datalinkConfig();
  const json = await call(c.submitPath, "POST", {
    workSpaceId: c.workSpaceId,
    appId: c.appId,
    formId: c.formId,
    externalId: offerId,
    data: mapFields(terms, c.fieldMap),
  });
  const id = pickPath(json, c.idField);
  if (id == null || id === "") throw new Error(`Datalink response has no ${c.idField}`);
  return { id: String(id), ...readStatus(json) };
}

function readStatus(json: unknown) {
  const c = datalinkConfig();
  const s = pickPath(json, c.statusField);
  const a = pickPath(json, c.approverField);
  return {
    status: s == null ? null : String(s),
    approver: a == null ? null : Array.isArray(a) ? a.join(", ") : String(a),
  };
}

export async function fetchDatalinkStatus(id: string) {
  const c = datalinkConfig();
  if (!c.statusPath) throw new Error("DATALINK_STATUS_PATH is not configured");
  const json =
    c.statusMethod === "POST"
      ? await call(fillPath(c.statusPath, id), "POST", {
          workSpaceId: c.workSpaceId,
          appId: c.appId,
          formId: c.formId,
          id,
        })
      : await call(fillPath(c.statusPath, id), "GET");
  return readStatus(json);
}
