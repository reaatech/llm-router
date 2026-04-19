terraform {
  required_version = ">= 1.6.0"
}

resource "google_cloud_run_v2_service" "llm_router" {
  name     = var.service_name
  location = var.region

  template {
    containers {
      image = var.image
      ports {
        container_port = var.port
      }
    }
  }
}
