import structlog
from firebase_admin import messaging

from app.models.user import User
from app.utils.firebase import _get_firebase_app

logger = structlog.get_logger()


def send_push_notification(
    user: User,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> bool:
    """Send a push notification to a user via FCM.

    Returns True if sent successfully, False otherwise.
    """
    if not user.fcm_token:
        return False

    _get_firebase_app()

    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
        token=user.fcm_token,
    )

    try:
        messaging.send(message)
        logger.info("push_notification_sent", user_id=str(user.id), title=title)
        return True
    except messaging.UnregisteredError:
        logger.warning("fcm_token_unregistered", user_id=str(user.id))
        return False
    except Exception as exc:
        logger.error("push_notification_failed", user_id=str(user.id), error=str(exc))
        return False


def send_content_published_notification(user: User, content_title: str, platform: str) -> bool:
    """Notify a user that their content was published."""
    return send_push_notification(
        user=user,
        title="Content Published",
        body=f'"{content_title}" was published to {platform}.',
        data={"type": "content_published", "url": "/calendar"},
    )


def send_schedule_reminder(user: User, content_title: str, minutes_until: int) -> bool:
    """Remind a user about upcoming scheduled content."""
    return send_push_notification(
        user=user,
        title="Upcoming Post",
        body=f'"{content_title}" is scheduled in {minutes_until} minutes.',
        data={"type": "schedule_reminder", "url": "/calendar"},
    )
