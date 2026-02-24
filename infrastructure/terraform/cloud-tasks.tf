# --------------------------------------------------------------------------- #
# cloud-tasks.tf — 4 Cloud Tasks queues
# --------------------------------------------------------------------------- #

resource "google_cloud_tasks_queue" "publishing" {
  name     = "publishing"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 5
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts       = 5
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "3600s"
  }

  depends_on = [google_project_service.apis["cloudtasks.googleapis.com"]]
}

resource "google_cloud_tasks_queue" "analytics_polling" {
  name     = "analytics-polling"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 20
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "60s"
    max_backoff        = "600s"
    max_doublings      = 3
    max_retry_duration = "1800s"
  }

  depends_on = [google_project_service.apis["cloudtasks.googleapis.com"]]
}

resource "google_cloud_tasks_queue" "content_processing" {
  name     = "content-processing"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 2
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "30s"
    max_backoff        = "600s"
    max_doublings      = 3
    max_retry_duration = "3600s"
  }

  depends_on = [google_project_service.apis["cloudtasks.googleapis.com"]]
}

resource "google_cloud_tasks_queue" "token_refresh" {
  name     = "token-refresh"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 5
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts       = 5
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "1800s"
  }

  depends_on = [google_project_service.apis["cloudtasks.googleapis.com"]]
}
