# --------------------------------------------------------------------------- #
# storage.tf — Cloud Storage buckets: upload + export
# --------------------------------------------------------------------------- #

# Upload bucket — user content uploads (audio, video, text, images)
resource "google_storage_bucket" "uploads" {
  name     = "${var.project_id}-uploads"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = false
  }
}

# Export bucket — analytics exports, reports
resource "google_storage_bucket" "exports" {
  name     = "${var.project_id}-exports"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = false
  }
}

# --- IAM bindings for buckets -----------------------------------------------

resource "google_storage_bucket_iam_member" "api_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "worker_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "worker_exports" {
  bucket = google_storage_bucket.exports.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}
