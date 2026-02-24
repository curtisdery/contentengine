# --------------------------------------------------------------------------- #
# firestore.tf — Firestore indexes + TTL policies
# --------------------------------------------------------------------------- #

# --- TTL policies ------------------------------------------------------------
# TTL policies are applied via gcloud CLI (not supported in Terraform):
#   gcloud firestore fields ttls update expires_at --collection-group=oauth_states
#   gcloud firestore fields ttls update expires_at --collection-group=rate_limits

# --- Composite indexes -------------------------------------------------------

# scheduled_posts: user_id + status (for due-post checker, overview queries)
resource "google_firestore_index" "scheduled_posts_user_status" {
  project    = var.project_id
  database   = "(default)"
  collection = "scheduled_posts"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "status"
    order      = "ASCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# scheduled_posts: user_id + platform + status (for platform analytics)
resource "google_firestore_index" "scheduled_posts_user_platform_status" {
  project    = var.project_id
  database   = "(default)"
  collection = "scheduled_posts"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "platform"
    order      = "ASCENDING"
  }
  fields {
    field_path = "status"
    order      = "ASCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# scheduled_posts: status + scheduled_at (for due-post checker)
resource "google_firestore_index" "scheduled_posts_status_scheduled_at" {
  project    = var.project_id
  database   = "(default)"
  collection = "scheduled_posts"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path = "scheduled_at"
    order      = "ASCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# post_analytics: scheduled_post_id + measured_at (for time-series queries)
resource "google_firestore_index" "post_analytics_post_measured" {
  project    = var.project_id
  database   = "(default)"
  collection = "post_analytics"

  fields {
    field_path = "scheduled_post_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "measured_at"
    order      = "ASCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# generated_outputs: content_upload_id (for content analytics)
resource "google_firestore_index" "generated_outputs_content" {
  project    = var.project_id
  database   = "(default)"
  collection = "generated_outputs"

  fields {
    field_path = "content_upload_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# multiplier_scores: user_id (for overview aggregation)
resource "google_firestore_index" "multiplier_scores_user" {
  project    = var.project_id
  database   = "(default)"
  collection = "multiplier_scores"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "calculated_at"
    order      = "DESCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# content_uploads: user_id + created_at (for content listing)
resource "google_firestore_index" "content_uploads_user_created" {
  project    = var.project_id
  database   = "(default)"
  collection = "content_uploads"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# milestones: event_id (for milestone dedup checks)
resource "google_firestore_index" "milestones_event" {
  project    = var.project_id
  database   = "(default)"
  collection = "milestones"

  fields {
    field_path = "event_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "reached_at"
    order      = "DESCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# connections: user_id + platform_id (for OAuth lookups)
resource "google_firestore_index" "connections_user_platform" {
  project    = var.project_id
  database   = "(default)"
  collection = "connections"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "platform_id"
    order      = "ASCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# notifications: user_id + created_at (for notification feed)
resource "google_firestore_index" "notifications_user_created" {
  project    = var.project_id
  database   = "(default)"
  collection = "notifications"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}
