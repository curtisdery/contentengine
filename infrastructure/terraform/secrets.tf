# --------------------------------------------------------------------------- #
# secrets.tf — Secret Manager secrets
# --------------------------------------------------------------------------- #

locals {
  secrets = {
    "stripe-secret-key"     = "Stripe API secret key"
    "stripe-webhook-secret" = "Stripe webhook signing secret"
    "anthropic-api-key"     = "Anthropic Claude API key"
    "token-encryption-key"  = "AES-256-GCM key for OAuth token encryption"
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key

  replication {
    auto {}
  }

  labels = {
    app         = "pandocast"
    environment = var.environment
  }

  depends_on = [google_project_service.apis["secretmanager.googleapis.com"]]
}

# --- IAM: API + Worker can access secrets ------------------------------------

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_access" {
  for_each = {
    for k, v in google_secret_manager_secret.secrets : k => v
    if k != "stripe-webhook-secret"
  }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
