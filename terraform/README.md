# Stitch Coffee Dashboard — Terraform

Infrastructure-as-code for the Stitch Coffee Dashboard Cloud Run service.

## Prerequisites

- Terraform >= 1.5
- GCP credentials with access to project `wigwag-415814`
- Shared VPC `internal-private-network` must exist in the project

## Resources

| Resource | Description |
|---|---|
| `google_cloud_run_v2_service.stitch_coffee_dashboard` | Cloud Run v2 service (Gen2, internal LB ingress) |
| `google_compute_subnetwork.stitch_coffee_dashboard` | Subnet `10.6.1.0/24` on the shared VPC |

## Secrets (GCP Secret Manager)

| Env Var | Secret Name |
|---|---|
| `DATABASE_URL` | `STITCH_COFFEE_DASHBOARD_DATABASE_URL` |

## Environment Variables

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `MERCHANT_ID` | `519a484c-d7e2-42d8-b193-3315f7246d01` |

## Usage

```bash
cd terraform

terraform init
terraform plan -var="STITCH_COFFEE_DASHBOARD_VERSION=latest"
terraform apply -var="STITCH_COFFEE_DASHBOARD_VERSION=latest"
```

## Notes

- The service image tag is managed via the `STITCH_COFFEE_DASHBOARD_VERSION` variable.
- `lifecycle.ignore_changes` on the container image allows CI/CD to update the image without Terraform drift.
- The subnet provides private VPC connectivity; egress is `PRIVATE_RANGES_ONLY`.
- `deletion_protection` is set to `false` for development convenience.
