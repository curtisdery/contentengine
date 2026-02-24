# --------------------------------------------------------------------------- #
# cloud-run.tf — Cloud Run v2 services: api (min 1), worker (min 0), web
# --------------------------------------------------------------------------- #

# --- API service -------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name     = "pandocast-api"
  location = var.region

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "FIREBASE_STORAGE_BUCKET"
        value = "${var.project_id}.firebasestorage.app"
      }
      env {
        name  = "WORKER_URL"
        value = google_cloud_run_v2_service.worker.uri
      }
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Secrets mounted as env vars
      dynamic "env" {
        for_each = {
          STRIPE_SECRET_KEY     = google_secret_manager_secret.secrets["stripe-secret-key"].id
          STRIPE_WEBHOOK_SECRET = google_secret_manager_secret.secrets["stripe-webhook-secret"].id
          ANTHROPIC_API_KEY     = google_secret_manager_secret.secrets["anthropic-api-key"].id
          TOKEN_ENCRYPTION_KEY  = google_secret_manager_secret.secrets["token-encryption-key"].id
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }

    timeout = "300s"
  }

  depends_on = [google_project_service.apis["run.googleapis.com"]]
}

# --- Worker service ----------------------------------------------------------

resource "google_cloud_run_v2_service" "worker" {
  name     = "pandocast-worker"
  location = var.region

  template {
    service_account = google_service_account.worker.email

    scaling {
      min_instance_count = var.worker_min_instances
      max_instance_count = var.worker_max_instances
    }

    containers {
      image = var.worker_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "FIREBASE_STORAGE_BUCKET"
        value = "${var.project_id}.firebasestorage.app"
      }
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      dynamic "env" {
        for_each = {
          STRIPE_SECRET_KEY    = google_secret_manager_secret.secrets["stripe-secret-key"].id
          ANTHROPIC_API_KEY    = google_secret_manager_secret.secrets["anthropic-api-key"].id
          TOKEN_ENCRYPTION_KEY = google_secret_manager_secret.secrets["token-encryption-key"].id
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }

    timeout = "900s"
  }

  depends_on = [google_project_service.apis["run.googleapis.com"]]
}

# --- Web frontend ------------------------------------------------------------

resource "google_cloud_run_v2_service" "web" {
  name     = "pandocast-web"
  location = var.region

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = var.web_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }

    timeout = "60s"
  }

  depends_on = [google_project_service.apis["run.googleapis.com"]]
}
