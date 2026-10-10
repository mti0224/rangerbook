#!/usr/bin/env bash
# Run ONCE in authenticated Google Cloud Shell, never on EC2.
# Requires Google Cloud IAM and Service Usage administration permissions.
# GA4 Viewer permission is granted separately in Google Analytics.
set -euo pipefail
PROJECT_ID="rangerbook-ga4-reader"
SERVICE_ACCOUNT="rangerbook-ga4-reader@rangerbook-ga4-reader.iam.gserviceaccount.com"
AWS_ACCOUNT="010421869571"
AWS_ROLE="EC2-SSM-Role"
EC2_INSTANCE="i-05cb332634cb5d0a9"
POOL_ID="rangerbook-ec2"
PROVIDER_ID="aws-rangerbook"
CONFIG_FILE="${PWD}/rangerbook-ga4-aws-wif.json"
command -v gcloud >/dev/null || { echo "Run this in Google Cloud Shell." >&2; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
test -n "$PROJECT_NUMBER"
gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null
echo "Project number: $PROJECT_NUMBER"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com analyticsdata.googleapis.com --project="$PROJECT_ID"
# Never reuse an existing pool with unverified trust controls.
if gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  echo "Pool already exists: inspect access policy and provider before proceeding." >&2
  exit 2
fi
gcloud iam workload-identity-pools create "$POOL_ID" --project="$PROJECT_ID" --location=global --display-name="Rangerbook EC2"
gcloud iam workload-identity-pools providers create-aws "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --account-id="$AWS_ACCOUNT" --attribute-mapping="google.subject=assertion.arn,attribute.account=assertion.account,attribute.aws_role=assertion.arn.extract('assumed-role/{role_name}/'),attribute.aws_ec2_instance=assertion.arn.extract('assumed-role/{role_and_session}').extract('/{session}')" --attribute-condition="attribute.account == '${AWS_ACCOUNT}' && attribute.aws_role == '${AWS_ROLE}' && attribute.aws_ec2_instance == '${EC2_INSTANCE}'" --display-name="Rangerbook AWS EC2 only"
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.aws_ec2_instance/${EC2_INSTANCE}"
# EC2 instance metadata requires IMDSv2; this config has no private key.
gcloud iam workload-identity-pools create-cred-config "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}" --service-account="$SERVICE_ACCOUNT" --aws --enable-imdsv2 --output-file="$CONFIG_FILE"
echo "GOOGLE_WIF_SETUP=SUCCESS"
echo "GOOGLE_PROJECT_NUMBER=$PROJECT_NUMBER"
echo "CREDENTIAL_CONFIG=$CONFIG_FILE"
echo "NEXT: Add service account as GA4 Property 540346392 Viewer."
echo "NEXT: Send GOOGLE_PROJECT_NUMBER and SUCCESS back in chat."
echo "Never upload a Google private-key JSON; config is keyless."
