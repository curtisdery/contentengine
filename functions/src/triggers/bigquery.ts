/**
 * BigQuery trigger — stream analytics snapshots to BigQuery on creation.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";

export const streamToBigQuery = onDocumentCreated("analyticsSnapshots/{docId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  try {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const bigquery = new BigQuery();

    const row = {
      workspace_id: data.workspaceId,
      generated_output_id: data.generatedOutputId,
      platform_id: data.platformId,
      snapshot_time: data.snapshotTime?.toDate()?.toISOString() ?? new Date().toISOString(),
      impressions: data.impressions ?? 0,
      engagements: data.engagements ?? 0,
      saves: data.saves ?? 0,
      shares: data.shares ?? 0,
      clicks: data.clicks ?? 0,
      follows: data.follows ?? 0,
      comments: data.comments ?? 0,
    };

    await bigquery
      .dataset("pandocast_analytics")
      .table("snapshots")
      .insert([row]);

    console.log(`Streamed analytics snapshot to BigQuery: ${event.params.docId}`);
  } catch (err) {
    // BigQuery streaming failures are non-fatal — data is still in Firestore
    console.warn("BigQuery stream failed (non-fatal):", err instanceof Error ? err.message : err);
  }
});
