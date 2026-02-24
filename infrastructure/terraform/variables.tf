# --------------------------------------------------------------------------- #
# variables.tf — Input variables for Pandocast infrastructure
# --------------------------------------------------------------------------- #

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "pandocast-af179"
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# --- Container images -------------------------------------------------------

variable "api_image" {
  description = "Container image for the API service"
  type        = string
  default     = "us-central1-docker.pkg.dev/pandocast-af179/pandocast/api:latest"
}

variable "worker_image" {
  description = "Container image for the worker service"
  type        = string
  default     = "us-central1-docker.pkg.dev/pandocast-af179/pandocast/worker:latest"
}

variable "web_image" {
  description = "Container image for the web frontend"
  type        = string
  default     = "us-central1-docker.pkg.dev/pandocast-af179/pandocast/web:latest"
}

# --- Scaling -----------------------------------------------------------------

variable "api_min_instances" {
  description = "Minimum instances for the API service"
  type        = number
  default     = 1
}

variable "api_max_instances" {
  description = "Maximum instances for the API service"
  type        = number
  default     = 10
}

variable "worker_min_instances" {
  description = "Minimum instances for the worker service"
  type        = number
  default     = 0
}

variable "worker_max_instances" {
  description = "Maximum instances for the worker service"
  type        = number
  default     = 5
}

variable "web_min_instances" {
  description = "Minimum instances for the web frontend"
  type        = number
  default     = 1
}

variable "web_max_instances" {
  description = "Maximum instances for the web frontend"
  type        = number
  default     = 5
}

# --- Domain ------------------------------------------------------------------

variable "domain" {
  description = "Custom domain for the web frontend (optional)"
  type        = string
  default     = ""
}
