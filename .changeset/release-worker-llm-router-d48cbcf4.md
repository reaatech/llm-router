---
"@reaatech/llm-router-engine": patch
---

- **@reaatech/llm-router-engine** (patch): PR #26 fixes a corrupted package.json dependency line in the published artifact (stray quote on @opentelemetry/exporter-metrics-otlp-grpc) that would break installs, and adds the matching changeset. A patch release is required to ship the fix to consumers.
