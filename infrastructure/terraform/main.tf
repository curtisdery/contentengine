# --------------------------------------------------------------------------- #
# main.tf — Provider configuration and project-level resources
# --------------------------------------------------------------------------- #

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "pandocast-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# --- Enable required APIs ----------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# --- Artifact Registry -------------------------------------------------------

resource "google_artifact_registry_repository" "pandocast" {
  location      = var.region
  repository_id = "pandocast"
  format        = "DOCKER"
  description   = "Pandocast container images"

  depends_on = [google_project_service.apis["artifactregistry.googleapis.com"]]
}
