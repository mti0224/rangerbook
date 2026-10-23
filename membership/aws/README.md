# Mumbai membership runtime permission review — 2026-10-23

Status: owner-approved and attached to `EC2-SSM-Role` on 2026-10-23.
`GetRolePolicy` returned an exact JSON document match. The existing
`AmazonSSMManagedInstanceCore` attachment is intact. Post-attachment
`SimulatePrincipalPolicy` passed 10/10 cases: six intended resource/action
combinations allowed; other sender, queue, secret and IAM modification denied.
No secret values were read, no emails sent and no services restarted.

Approved target: existing `EC2-SSM-Role`, inline policy name
`RangerbookMembershipRuntimeV2`. Preserve the existing SSM managed policy.
The role is available to processes on the EC2 host, not only FastAPI. Recheck
profile consumers before attachment; use a dedicated workload boundary if
host-level sharing is unacceptable.

## Policy provenance and scope

IAM Policy Autopilot 0.3.0 was executed against the actual Python mail worker:

```sh
uvx --offline iam-policy-autopilot generate-policies \
  /workspace/scratch/330bd6b556a7/rangerbook/membership/mail_worker.py \
  --region ap-south-1 --account 010421869571 --service-hints sesv2 sqs --pretty
```

`runtime-policy.json` scopes its sending and receive/delete baseline to observed
resources. The generic KMS dependency is excluded because `GetQueueAttributes`
confirmed SSE-SQS, not SSE-KMS. The generic SES template path is excluded because
the worker sends Simple messages. The credential statement permits only the two
observed secret ARNs; their values were never retrieved. Both secrets use the
default Secrets Manager key. Runtime credential resolution must use `asm-exec`
dynamic references and never print the resolved environment.

Statements:

- `MembershipSender`: SES SendEmail for the warmycat.com identity and dedicated
  configuration set, constrained to noreply@warmycat.com and Mumbai.
- `MembershipFeedback`: receive/delete only on the dedicated feedback queue.
- `MembershipCredentials`: read only the existing Google OAuth and Turnstile
  secrets, without write/list/rotation access.

The worker always passes ConfigurationSetName. IAM's identity permission alone
does not require that a caller supplies a configuration set; enforce that in the
application and test the complete request at staging. This policy is additive:
implicit-deny simulation cases do not override permissions from other policies.

## Actual AWS verification

Access Analyzer ValidatePolicy: **zero findings**.
SimulateCustomPolicy: **14/14 expected decisions**:

| Case | Result |
| --- | --- |
| SES domain, correct sender and region | allowed |
| Different sender | implicitDeny |
| Different requested region | implicitDeny |
| Dedicated configuration set | allowed |
| Different configuration set | implicitDeny |
| Feedback queue receive | allowed |
| Feedback queue delete | allowed |
| Different queue | implicitDeny |
| Google secret read | allowed |
| Turnstile secret read | allowed |
| Different secret read | implicitDeny |
| Secret write | implicitDeny |
| IAM role policy modification | implicitDeny |
| Arbitrary KMS decrypt | implicitDeny |

Simulation does not prove real SES delivery, feedback processing, resource-policy
compatibility, secret JSON key correctness, or OAuth/CAPTCHA acceptance.

## Existing feedback resources

- Configuration set: `rangerbook-membership`.
- SNS: `arn:aws:sns:ap-south-1:010421869571:rangerbook-membership-feedback`.
- SQS: `https://sqs.ap-south-1.amazonaws.com/010421869571/rangerbook-membership-feedback`.
- SES destination enabled: SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT,
  RENDERING_FAILURE and DELIVERY_DELAY.
- SES topic publisher and SNS queue publisher policies restrict source ARN and
  source account. SNS raw delivery is disabled for the worker's envelope check.
- Queue: SSE-SQS, 14-day retention, 60-second visibility, 20-second default poll.
  Worker currently explicitly polls for one second; the queue default does not
  override that application setting.

## Approval and rollback

After owner approval, add only the named inline policy; do not replace the role,
its trust policy, its instance profile or existing permissions. Retrieve the
written policy and compare its JSON/hash, then simulate the effective principal.
No backend restart, production database migration, secret-value retrieval or
email sending is authorized by this permission preparation.

Rollback is deletion of inline policy `RangerbookMembershipRuntimeV2` from
`EC2-SSM-Role`, leaving SSM intact. Do not delete the secrets or feedback queue.
Runtime timers remain disabled until the isolated release and mail acceptance
tests pass. A queue has one pending message at inspection; inspect only a
sanitized event shape when testing to avoid exposing recipient data or message
contents. Retest rejection of malformed SES validation notifications before
enabling the worker.
