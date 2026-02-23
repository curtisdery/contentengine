"use strict";
/**
 * Cloud Tasks enqueue utility — creates HTTP target tasks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueTask = enqueueTask;
exports.getTaskHandlerUrl = getTaskHandlerUrl;
const tasks_1 = require("@google-cloud/tasks");
const env_js_1 = require("../config/env.js");
let _client = null;
function getClient() {
    if (!_client) {
        _client = new tasks_1.CloudTasksClient();
    }
    return _client;
}
/**
 * Enqueue a Cloud Task that HTTP POSTs to the given URL with JSON payload.
 * Uses OIDC token for authentication (same service account as functions).
 */
async function enqueueTask(options) {
    const client = getClient();
    const project = env_js_1.GCP_PROJECT.value();
    const location = env_js_1.GCP_LOCATION.value();
    const parent = client.queuePath(project, location, options.queue);
    const task = {
        httpRequest: {
            httpMethod: "POST",
            url: options.url,
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify(options.payload)).toString("base64"),
            oidcToken: {
                serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
            },
        },
    };
    if (options.delaySeconds && options.delaySeconds > 0) {
        const scheduleTime = new Date(Date.now() + options.delaySeconds * 1000);
        task.scheduleTime = {
            seconds: Math.floor(scheduleTime.getTime() / 1000),
        };
    }
    const [response] = await client.createTask({ parent, task });
    return response.name || "";
}
/** Build the Cloud Run URL for a task handler function. */
function getTaskHandlerUrl(functionName) {
    const project = env_js_1.GCP_PROJECT.value();
    const location = env_js_1.GCP_LOCATION.value();
    return `https://${location}-${project}.cloudfunctions.net/${functionName}`;
}
//# sourceMappingURL=taskClient.js.map