"""Cloud Tasks enqueue — dispatches async work to the worker service."""

import json
import logging
from datetime import timedelta

from google.cloud import tasks_v2
from google.protobuf import duration_pb2, timestamp_pb2

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_client: tasks_v2.CloudTasksAsyncClient | None = None


def _get_client() -> tasks_v2.CloudTasksAsyncClient:
    global _client
    if _client is None:
        _client = tasks_v2.CloudTasksAsyncClient()
    return _client


async def enqueue_task(
    queue: str,
    handler: str,
    payload: dict,
    delay_seconds: int = 0,
    task_id: str | None = None,
) -> str:
    """Enqueue an async task via Google Cloud Tasks.

    Args:
        queue: Cloud Tasks queue name (e.g. "content-analysis", "publishing").
        handler: Handler path appended to WORKER_URL (e.g. "analyze-content").
                 The full URL becomes {WORKER_URL}/internal/tasks/{handler}.
        payload: JSON-serializable dict sent as the request body.
        delay_seconds: Optional delay before the task is dispatched.
        task_id: Optional dedup ID. If a task with this ID already exists
                 in the queue, Cloud Tasks will reject the duplicate.

    Returns:
        The fully qualified task name.
    """
    client = _get_client()

    parent = client.queue_path(
        settings.GCP_PROJECT,
        settings.GCP_LOCATION,
        queue,
    )

    url = f"{settings.WORKER_URL}/internal/tasks/{handler}"

    task: dict = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": url,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(payload).encode(),
            "oidc_token": {
                "service_account_email": f"{settings.GCP_PROJECT}@appspot.gserviceaccount.com",
            },
        },
    }

    if task_id:
        task["name"] = f"{parent}/tasks/{task_id}"

    if delay_seconds > 0:
        from datetime import datetime, timezone
        schedule_time = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        ts = timestamp_pb2.Timestamp()
        ts.FromDatetime(schedule_time)
        task["schedule_time"] = ts

    response = await client.create_task(
        parent=parent,
        task=task,
    )

    logger.info(
        "Enqueued task %s → %s (queue=%s, delay=%ds)",
        response.name, url, queue, delay_seconds,
    )

    return response.name
