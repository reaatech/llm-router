module "llm_router" {
  source       = "../../modules/cloud-run"
  service_name = "llm-router-dev"
  region       = "us-central1"
  image        = "ghcr.io/llm-router/llm-router:dev"
}
