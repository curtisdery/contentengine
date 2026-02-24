"""Tests for Firestore-backed calendar, publishing pipeline, and distribution arc."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.publishers.base import PublishResult
from app.services.scheduler import DISTRIBUTION_ARC, FORMAT_TIERS
from app.utils.exceptions import NotFoundError, ValidationError


# ---------------------------------------------------------------------------
# Helpers — fake Firestore document / async stream
# ---------------------------------------------------------------------------

def _make_doc(doc_id: str, data: dict, *, exists: bool = True):
    """Create a mock Firestore document snapshot."""
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = exists
    doc.to_dict.return_value = data
    doc.reference = MagicMock()
    doc.reference.update = AsyncMock()
    return doc


def _doc_ref(doc_snapshot):
    """Create a mock document reference that returns the given snapshot on .get()."""
    ref = MagicMock()
    ref.get = AsyncMock(return_value=doc_snapshot)
    ref.update = AsyncMock()
    ref.set = AsyncMock()
    return ref


def _collection_with_docs(*docs):
    """Return a mock query whose .stream() yields the given docs."""
    async def fake_stream():
        for d in docs:
            yield d

    query = MagicMock()
    query.stream = fake_stream
    query.where = MagicMock(return_value=query)
    query.limit = MagicMock(return_value=query)
    return query


def _empty_stream():
    """Return a mock query whose .stream() yields nothing."""
    async def fake_stream():
        return
        yield  # noqa: make it an async generator

    query = MagicMock()
    query.stream = fake_stream
    query.where = MagicMock(return_value=query)
    query.limit = MagicMock(return_value=query)
    return query


def _fake_user(user_id="user_1"):
    return MagicMock(id=user_id)


NOW = datetime(2026, 2, 23, 12, 0, 0, tzinfo=timezone.utc)

SAMPLE_OUTPUT = {
    "user_id": "user_1",
    "content": "Hello world",
    "platform": "twitter",
    "status": "approved",
}

SAMPLE_EVENT = {
    "user_id": "user_1",
    "output_id": "output_1",
    "platform": "twitter",
    "scheduled_at": NOW - timedelta(minutes=5),
    "status": "scheduled",
    "retry_count": 0,
    "max_retries": 3,
}


# ---------------------------------------------------------------------------
# 1. test_schedule_creates_queued_post
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_schedule_creates_queued_post():
    """POST /schedule creates a scheduled_posts doc and updates the output status."""
    from app.api.v1.calendar import schedule_output, ScheduleRequest

    output_doc = _make_doc("output_1", SAMPLE_OUTPUT)
    output_ref = _doc_ref(output_doc)

    # No existing scheduled posts for this output
    empty_q = _empty_stream()

    # Track the scheduled post creation
    created_ref = MagicMock()
    created_ref.id = "event_abc"
    add_result = (None, created_ref)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        elif name == "scheduled_posts":
            coll.where.return_value = empty_q
            coll.add = AsyncMock(return_value=add_result)
            return coll
        return coll

    db.collection.side_effect = route_collection

    body = ScheduleRequest(
        output_id="output_1",
        scheduled_at=NOW + timedelta(hours=2),
        platform="twitter",
    )

    with patch("app.api.v1.calendar.get_db", return_value=db):
        result = await schedule_output(body=body, current_user=_fake_user())

    assert result["id"] == "event_abc"
    assert result["status"] == "scheduled"
    assert result["platform"] == "twitter"
    output_ref.update.assert_called_once()


# ---------------------------------------------------------------------------
# 2. test_publish_succeeds_updates_status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_publish_succeeds_updates_status():
    """publish-post marks event as published and updates the output."""
    from app.api.v1.internal import publish_post

    event_doc = _make_doc("event_1", SAMPLE_EVENT)
    event_ref = _doc_ref(event_doc)

    output_doc = _make_doc("output_1", SAMPLE_OUTPUT)
    output_ref = _doc_ref(output_doc)

    conn_doc = _make_doc("conn_1", {
        "platform": "twitter",
        "user_id": "user_1",
        "is_active": True,
        "access_token_encrypted": "encrypted_token",
    })
    conn_stream = _collection_with_docs(conn_doc)

    user_ref = MagicMock()
    user_ref.update = AsyncMock()

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.document.return_value = event_ref
            return coll
        elif name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        elif name == "connected_platforms":
            coll.where.return_value = conn_stream
            return coll
        elif name == "users":
            coll.document.return_value = user_ref
            return coll
        return coll

    db.collection.side_effect = route_collection

    publish_result = PublishResult(
        success=True,
        platform="twitter",
        platform_post_id="tweet_123",
        platform_post_url="https://twitter.com/i/status/tweet_123",
    )

    request = MagicMock()
    request.json = AsyncMock(return_value={"event_id": "event_1"})

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.decrypt", return_value="real_token"), \
         patch("app.api.v1.internal.get_publisher") as mock_pub:
        mock_publisher = MagicMock()
        mock_publisher.validate = MagicMock()
        mock_publisher.publish = AsyncMock(return_value=publish_result)
        mock_pub.return_value = mock_publisher

        result = await publish_post(request)

    assert result["status"] == "published"
    assert result["platform_post_id"] == "tweet_123"
    # Event ref should have been updated with "published" status
    event_ref.update.assert_called()


# ---------------------------------------------------------------------------
# 3. test_publish_thread_chains
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_publish_thread_chains():
    """Twitter publisher splits \\n---\\n content into chained reply tweets."""
    from app.services.publishers.twitter import TwitterPublisher

    publisher = TwitterPublisher()
    content = "First tweet\n---\nSecond tweet\n---\nThird tweet"
    output = {"content": content}

    # Validate should pass (all under 280 chars)
    publisher.validate(output)

    call_count = 0

    async def mock_post(url, json, headers):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 201
        resp.json.return_value = {"data": {"id": f"tweet_{call_count}"}}
        return resp

    with patch("app.services.publishers.twitter.httpx.AsyncClient") as mock_client_cls:
        ctx = AsyncMock()
        ctx.post = mock_post
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=ctx)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await publisher.publish(output=output, token="token_123")

    assert result.success is True
    assert result.metadata.get("thread_length") == 3
    assert result.platform_post_id == "tweet_1"
    assert call_count == 3


# ---------------------------------------------------------------------------
# 4. test_publish_retries_on_rate_limit
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_publish_retries_on_rate_limit():
    """When publish fails and retry_count < max_retries, event is re-queued with backoff."""
    from app.api.v1.internal import publish_post

    event_data = {**SAMPLE_EVENT, "retry_count": 0, "max_retries": 3}
    event_doc = _make_doc("event_1", event_data)
    event_ref = _doc_ref(event_doc)

    output_doc = _make_doc("output_1", SAMPLE_OUTPUT)
    output_ref = _doc_ref(output_doc)

    conn_doc = _make_doc("conn_1", {
        "platform": "twitter",
        "user_id": "user_1",
        "is_active": True,
        "access_token_encrypted": "enc",
    })
    conn_stream = _collection_with_docs(conn_doc)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.document.return_value = event_ref
            return coll
        elif name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        elif name == "connected_platforms":
            coll.where.return_value = conn_stream
            return coll
        return coll

    db.collection.side_effect = route_collection

    request = MagicMock()
    request.json = AsyncMock(return_value={"event_id": "event_1"})

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.decrypt", return_value="tok"), \
         patch("app.api.v1.internal.get_publisher") as mock_pub:
        mock_publisher = MagicMock()
        mock_publisher.validate = MagicMock()
        mock_publisher.publish = AsyncMock(side_effect=Exception("429 Too Many Requests"))
        mock_pub.return_value = mock_publisher

        result = await publish_post(request)

    assert result["status"] == "retrying"
    assert result["retry_count"] == 1
    assert result["backoff_seconds"] == 120  # 2^1 * 60


# ---------------------------------------------------------------------------
# 5. test_publish_fails_permanently_on_auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_publish_fails_permanently_on_auth():
    """When retries exhausted, event is marked failed permanently."""
    from app.api.v1.internal import publish_post

    event_data = {**SAMPLE_EVENT, "retry_count": 2, "max_retries": 3}
    event_doc = _make_doc("event_1", event_data)
    event_ref = _doc_ref(event_doc)

    output_doc = _make_doc("output_1", SAMPLE_OUTPUT)
    output_ref = _doc_ref(output_doc)

    conn_doc = _make_doc("conn_1", {
        "platform": "twitter",
        "user_id": "user_1",
        "is_active": True,
        "access_token_encrypted": "enc",
    })
    conn_stream = _collection_with_docs(conn_doc)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.document.return_value = event_ref
            return coll
        elif name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        elif name == "connected_platforms":
            coll.where.return_value = conn_stream
            return coll
        return coll

    db.collection.side_effect = route_collection

    request = MagicMock()
    request.json = AsyncMock(return_value={"event_id": "event_1"})

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.decrypt", return_value="tok"), \
         patch("app.api.v1.internal.get_publisher") as mock_pub:
        mock_publisher = MagicMock()
        mock_publisher.validate = MagicMock()
        mock_publisher.publish = AsyncMock(side_effect=Exception("401 Unauthorized"))
        mock_pub.return_value = mock_publisher

        result = await publish_post(request)

    assert result["status"] == "failed"
    assert "401 Unauthorized" in result["reason"]
    # Event should be updated with "failed" status
    event_ref.update.assert_called()
    last_update = event_ref.update.call_args[0][0]
    assert last_update["status"] == "failed"
    assert last_update["retry_count"] == 3


# ---------------------------------------------------------------------------
# 6. test_publish_idempotent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_publish_idempotent():
    """Publish-post skips already-published or cancelled events."""
    from app.api.v1.internal import publish_post

    for terminal_status in ("published", "cancelled"):
        event_data = {**SAMPLE_EVENT, "status": terminal_status}
        event_doc = _make_doc("event_1", event_data)
        event_ref = _doc_ref(event_doc)

        db = MagicMock()
        coll = MagicMock()
        coll.document.return_value = event_ref
        db.collection.return_value = coll

        request = MagicMock()
        request.json = AsyncMock(return_value={"event_id": "event_1"})

        with patch("app.api.v1.internal.get_db", return_value=db):
            result = await publish_post(request)

        assert result["status"] == "skipped"
        assert f"already_{terminal_status}" in result["reason"]


# ---------------------------------------------------------------------------
# 7. test_distribution_arc_tiers
# ---------------------------------------------------------------------------

def test_distribution_arc_tiers():
    """FORMAT_TIERS cover all expected distribution arc days and DISTRIBUTION_ARC has valid entries."""
    # Verify FORMAT_TIERS keys are ordered correctly
    tier_order = ["immediate", "day2", "day3", "day5", "day7", "day10", "day14"]
    assert list(FORMAT_TIERS.keys()) == tier_order

    # Verify each tier has at least one format
    for tier, formats in FORMAT_TIERS.items():
        assert len(formats) > 0, f"Tier {tier} has no formats"

    # Verify DISTRIBUTION_ARC entries have required keys
    for platform_id, info in DISTRIBUTION_ARC.items():
        assert "day" in info, f"{platform_id} missing 'day'"
        assert "hour" in info, f"{platform_id} missing 'hour'"
        assert "minute" in info, f"{platform_id} missing 'minute'"
        assert 0 <= info["hour"] <= 23, f"{platform_id} has invalid hour {info['hour']}"
        assert 0 <= info["minute"] <= 59, f"{platform_id} has invalid minute"

    # Verify immediate formats map to day-1 in DISTRIBUTION_ARC
    immediate_formats = FORMAT_TIERS["immediate"]
    for fmt in immediate_formats:
        arc_key = fmt.lower()
        if arc_key in DISTRIBUTION_ARC:
            assert DISTRIBUTION_ARC[arc_key]["day"] == 1, \
                f"Immediate format {fmt} should be day 1 in arc"


# ---------------------------------------------------------------------------
# 8. test_distribution_arc_conflicts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_distribution_arc_conflicts():
    """Scheduling an already-scheduled output raises ValidationError."""
    from app.api.v1.calendar import schedule_output, ScheduleRequest

    output_doc = _make_doc("output_1", SAMPLE_OUTPUT)
    output_ref = _doc_ref(output_doc)

    # Existing scheduled post for this output
    existing_doc = _make_doc("existing_event", SAMPLE_EVENT)
    existing_q = _collection_with_docs(existing_doc)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        elif name == "scheduled_posts":
            coll.where.return_value = existing_q
            return coll
        return coll

    db.collection.side_effect = route_collection

    body = ScheduleRequest(
        output_id="output_1",
        scheduled_at=NOW + timedelta(hours=3),
    )

    with patch("app.api.v1.calendar.get_db", return_value=db):
        with pytest.raises(ValidationError) as exc_info:
            await schedule_output(body=body, current_user=_fake_user())

    assert "Already scheduled" in exc_info.value.message


# ---------------------------------------------------------------------------
# 9. test_due_post_checker
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_due_post_checker():
    """check-due-posts finds due events and enqueues publish tasks."""
    from app.api.v1.internal import check_due_posts

    due_1 = _make_doc("event_due_1", {**SAMPLE_EVENT, "scheduled_at": NOW - timedelta(minutes=5)})
    due_2 = _make_doc("event_due_2", {**SAMPLE_EVENT, "scheduled_at": NOW - timedelta(minutes=1)})

    due_stream = _collection_with_docs(due_1, due_2)

    db = MagicMock()
    coll = MagicMock()
    coll.where.return_value = due_stream
    db.collection.return_value = coll

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.enqueue_task", new_callable=AsyncMock) as mock_enqueue:
        mock_enqueue.return_value = "tasks/publish-event_due_1"

        result = await check_due_posts()

    assert result["enqueued"] == 2
    assert mock_enqueue.call_count == 2

    # Verify dedup task IDs
    call_args_list = mock_enqueue.call_args_list
    task_ids = [c.kwargs.get("task_id") for c in call_args_list]
    assert "publish-event_due_1" in task_ids
    assert "publish-event_due_2" in task_ids


# ---------------------------------------------------------------------------
# 10. test_cancel_post
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_post():
    """DELETE /{post_id} cancels event and reverts output to approved."""
    from app.api.v1.calendar import cancel_post

    event_doc = _make_doc("event_1", SAMPLE_EVENT)
    event_ref = _doc_ref(event_doc)

    output_doc = _make_doc("output_1", {**SAMPLE_OUTPUT, "status": "scheduled"})
    output_ref = _doc_ref(output_doc)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.document.return_value = event_ref
            return coll
        elif name == "generated_outputs":
            coll.document.return_value = output_ref
            return coll
        return coll

    db.collection.side_effect = route_collection

    with patch("app.api.v1.calendar.get_db", return_value=db):
        result = await cancel_post(post_id="event_1", current_user=_fake_user())

    # Result is None (204 No Content)
    assert result is None

    # Event should be cancelled
    event_ref.update.assert_called_once()
    event_update = event_ref.update.call_args[0][0]
    assert event_update["status"] == "cancelled"

    # Output should revert to approved
    output_ref.update.assert_called_once()
    output_update = output_ref.update.call_args[0][0]
    assert output_update["status"] == "approved"
    assert output_update["scheduled_at"] is None
