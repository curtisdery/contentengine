/**
 * Cloud Tasks enqueue utility — creates HTTP target tasks.
 */

import { CloudTasksClient } from "@google-cloud/tasks";
import { GCP_PROJECT, GCP_LOCATION } from "../config/env.js";

let _client: CloudTasksClient | null = null;

function getClient(): CloudTasksClient {
  if (!_client) {
    _client = new CloudTasksClient();
  }
  return _client;
}

export interface EnqueueOptions {
  queue: string;
  url: string;
  payload: Record<string, unknown>;
  delaySeconds?: number;
}

/**
 * Enqueue a Cloud Task that HTTP POSTs to the given URL with JSON payload.
 * Uses OIDC token for authentication (same service account as functions).
 */
export async function enqueueTask(options: EnqueueOptions): Promise<string> {
  const client = getClient();
  const project = GCP_PROJECT.value();
  const location = GCP_LOCATION.value();

  const parent = client.queuePath(project, location, options.queue);

  const task: Record<string, unknown> = {
    httpRequest: {
      httpMethod: "POST" as const,
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
    (task as Record<string, unknown>).scheduleTime = {
      seconds: Math.floor(scheduleTime.getTime() / 1000),
    };
  }

  const [response] = await client.createTask({ parent, task });
  return response.name || "";
}

/** Build the Cloud Run URL for a task handler function. */
export function getTaskHandlerUrl(functionName: string): string {
  const project = GCP_PROJECT.value();
  const location = GCP_LOCATION.value();
  return `https://${location}-${project}.cloudfunctions.net/${functionName}`;
}
