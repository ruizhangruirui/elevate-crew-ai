# Datalink Offer approval API — server configuration

Set these in the company server environment (.env / systemd), then restart the app.
Required (the panel stays read-only until all three are set):
- DATALINK_API_BASE_URL   e.g. https://datalink-de.gtsdata.huawei.com
- DATALINK_API_KEY
- DATALINK_SUBMIT_PATH    POST endpoint that creates the approval (path only)

Optional:
- DATALINK_STATUS_PATH    endpoint to read status, `{id}` is replaced, e.g. /api/form/task/{id}
- DATALINK_STATUS_METHOD  GET (default) or POST
- DATALINK_AUTH_HEADER    default Authorization
- DATALINK_AUTH_PREFIX    default "Bearer " (set empty for raw key)
- DATALINK_WORKSPACE_ID / DATALINK_APP_ID / DATALINK_FORM_ID  default to the current offer form
- DATALINK_ID_FIELD       response path of the new request id, default data.id
- DATALINK_STATUS_FIELD   default data.status
- DATALINK_APPROVER_FIELD default data.currentApprover
- DATALINK_FIELD_MAP      JSON renaming offer fields to Datalink field names,
  e.g. {"job_title":"jobName","salary_information":"salary"}

Submit body sent: {workSpaceId, appId, formId, externalId: <offer id>, data: {...offer fields}}.
Database: apply drizzle/migrations/0047_offer_datalink_link.sql.
