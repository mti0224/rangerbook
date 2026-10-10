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
# Safe resume after a partial setup: inspect and verify existing resources.
POOL_JSON="$(gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global --format=json 2>/dev/null || true)"
if [ -n "$POOL_JSON" ]; then
  printf '%s' "$POOL_JSON" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p.get("state")=="ACTIVE", "WIF pool is not active"'
  echo "Reusing verified existing Workload Identity Pool: $POOL_ID"
else
  gcloud iam workload-identity-pools create "$POOL_ID" --project="$PROJECT_ID" --location=global --display-name="Rangerbook EC2"
fi

PROVIDER_JSON="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --format=json 2>/dev/null || true)"
if [ -n "$PROVIDER_JSON" ]; then
  printf '%s' "$PROVIDER_JSON" | python3 -c '
import json,sys
p=json.load(sys.stdin)
account,role,instance=sys.argv[1:]
mapping=p.get("attributeMapping",{})
condition=p.get("attributeCondition","")
assert p.get("state")=="ACTIVE", "Existing WIF provider is not active"
assert str(p.get("aws",{}).get("accountId"))==account, "Existing AWS account differs"
assert mapping.get("google.subject")=="assertion.arn", "Existing subject mapping differs"
assert mapping.get("attribute.account")=="assertion.account", "Existing account mapping differs"
assert mapping.get("attribute.aws_role", "").startswith("assertion.arn.extract("), "Missing AWS role mapping"
assert mapping.get("attribute.aws_ec2_instance","").startswith("assertion.arn.extract("), "Missing EC2 instance mapping"
for key,value in (("attribute.account",account),("attribute.aws_role",role),("attribute.aws_ec2_instance",instance)):
    assert key+" == "+chr(39)+value+chr(39) in condition, "Existing provider condition differs: "+key
print("Existing provider verified: AWS account, role, instance and mapping")
' "$AWS_ACCOUNT" "$AWS_ROLE" "$EC2_INSTANCE"
else
  gcloud iam workload-identity-pools providers create-aws "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --account-id="$AWS_ACCOUNT" --attribute-mapping="google.subject=assertion.arn,attribute.account=assertion.account,attribute.aws_role=assertion.arn.extract('assumed-role/{role_name}/'),attribute.aws_ec2_instance=assertion.arn.extract('assumed-role/{role_and_session}').extract('/{session}')" --attribute-condition="attribute.account == '$AWS_ACCOUNT' && attribute.aws_role == '$AWS_ROLE' && attribute.aws_ec2_instance == '$EC2_INSTANCE'" --display-name="Rangerbook AWS EC2 only"
fi

if ! gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.aws_ec2_instance/$EC2_INSTANCE"; then
  echo "Missing iam.serviceAccounts.setIamPolicy. Ask an authorized administrator to grant Service Account Admin on the target service account." >&2
  echo "Pool and provider remain intact; rerun this script after permissions are fixed." >&2
  exit 3
fi
# EC2 instance metadata requires IMDSv2; this config has no private key.
gcloud iam workload-identity-pools create-cred-config "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}" --service-account="$SERVICE_ACCOUNT" --aws --enable-imdsv2 --output-file="$CONFIG_FILE"
echo "GOOGLE_WIF_SETUP=SUCCESS"
echo "GOOGLE_PROJECT_NUMBER=$PROJECT_NUMBER"
echo "CREDENTIAL_CONFIG=$CONFIG_FILE"
echo "NEXT: Add service account as GA4 Property 540346392 Viewer."
echo "NEXT: Send GOOGLE_PROJECT_NUMBER and SUCCESS back in chat."
echo "Never upload a Google private-key JSON; config is keyless."
