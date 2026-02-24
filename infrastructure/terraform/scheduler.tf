# --------------------------------------------------------------------------- #
# scheduler.tf — 5 Cloud Scheduler cron jobs
# --------------------------------------------------------------------------- #

# 1. Check due posts — every 1 minute
resource "google_cloud_scheduler_job" "check_due_posts" {
  name     = "check-due-posts"
  schedule = "* * * * *"
  timezone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/api/v1/internal/tasks/check-due-posts"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "5s"
    max_backoff_duration = "10s"
  }

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}

# 2. Recalculate multiplier scores — daily at 3 AM UTC
resource "google_cloud_scheduler_job" "recalculate_scores" {
  name     = "recalculate-scores"
  schedule = "0 3 * * *"
  timezone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/api/v1/internal/tasks/recalculate-scores"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count          = 2
    min_backoff_duration = "30s"
    max_backoff_duration = "120s"
  }

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}

# 3. Refresh expiring OAuth tokens — every 6 hours
resource "google_cloud_scheduler_job" "refresh_expiring_tokens" {
  name     = "refresh-expiring-tokens"
  schedule = "0 */6 * * *"
  timezone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/api/v1/internal/tasks/refresh-expiring-tokens"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count          = 2
    min_backoff_duration = "60s"
    max_backoff_duration = "300s"
  }

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}

# 4. Clean up expired data — daily at 4 AM UTC
resource "google_cloud_scheduler_job" "cleanup_expired" {
  name     = "cleanup-expired"
  schedule = "0 4 * * *"
  timezone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/api/v1/internal/tasks/cleanup-expired"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "30s"
    max_backoff_duration = "60s"
  }

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}

# 5. Autopilot scheduling — every 15 minutes
resource "google_cloud_scheduler_job" "autopilot_schedule" {
  name     = "autopilot-schedule"
  schedule = "*/15 * * * *"
  timezone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/api/v1/internal/tasks/autopilot-schedule"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "10s"
    max_backoff_duration = "30s"
  }

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}
