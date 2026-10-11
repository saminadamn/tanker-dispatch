# Deploys the whole app with only the AWS CLI (SAM CLI not required).
# Usage:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1 [-Region ap-south-1] [-StackName tanker-dispatch] [-NoSeed] [-AlertEmail you@example.com] [-ExternalSite]
param(
  [string]$Region = "ap-south-1",
  [string]$StackName = "tanker-dispatch",
  [switch]$NoSeed,
  [string]$AlertEmail = "",  # email for error alarms; AWS sends a confirmation link first
  [switch]$ExternalSite      # skip S3 + CloudFront; frontend/ is hosted elsewhere (GitHub Pages publishes it on git push)
)
$ErrorActionPreference = "Continue"  # native errors are checked via $LASTEXITCODE
Set-Location $PSScriptRoot

function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }

Write-Host "==> Checking AWS credentials" -ForegroundColor Cyan
$account = aws sts get-caller-identity --query Account --output text; Check "aws sts get-caller-identity"
Write-Host "    Account $account, region $Region"

$artifacts = "tanker-sam-artifacts-$account-$Region"
aws s3api head-bucket --bucket $artifacts --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "==> Creating artifacts bucket $artifacts" -ForegroundColor Cyan
  aws s3 mb "s3://$artifacts" --region $Region; Check "create artifacts bucket"
}

# Token signing secret for sign-in. Created once; reusing it keeps people signed in across deploys.
$secretName = "/tanker-dispatch/auth-secret"
aws ssm get-parameter --name $secretName --region $Region --query Parameter.Name --output text 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "==> Creating sign-in secret in SSM Parameter Store ($secretName)" -ForegroundColor Cyan
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  aws ssm put-parameter --name $secretName --type SecureString --value ([Convert]::ToBase64String($bytes)) `
    --region $Region | Out-Null; Check "create auth secret"
}

Write-Host "==> Packaging Lambda code" -ForegroundColor Cyan
aws cloudformation package --template-file template.yaml --s3-bucket $artifacts `
  --output-template-file packaged.yaml --region $Region; Check "cloudformation package"

Write-Host "==> Deploying stack $StackName (first deploy takes 5-8 minutes because of CloudFront)" -ForegroundColor Cyan
$params = @()
if ($AlertEmail) { $params += "AlertEmail=$AlertEmail" }
if ($ExternalSite) { $params += "WebsiteHosting=external" }
$overrides = @()
if ($params) { $overrides = @("--parameter-overrides") + $params }
aws cloudformation deploy --template-file packaged.yaml --stack-name $StackName `
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --region $Region --no-fail-on-empty-changeset @overrides
Check "cloudformation deploy"

function Output($key) {
  aws cloudformation describe-stacks --stack-name $StackName --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
}
$apiUrl = Output "ApiUrl"
if (-not $ExternalSite) {
  $siteUrl = Output "WebsiteUrl"
  $bucket = Output "WebsiteBucketName"
}
$fn = Output "FunctionName"

Write-Host "==> Writing frontend/config.js" -ForegroundColor Cyan
$demo = if ($NoSeed) { "false" } else { "true" }  # demo data includes demo sign-in accounts; show them on the sign-in form
"window.API_URL = `"$apiUrl`";`nwindow.DEMO = $demo;" | Out-File -FilePath frontend/config.js -Encoding ascii

if (-not $ExternalSite) {
  Write-Host "==> Uploading frontend to s3://$bucket" -ForegroundColor Cyan
  aws s3 sync frontend "s3://$bucket" --delete --cache-control "no-cache" --region $Region; Check "s3 sync"
}

if (-not $NoSeed) {
  Write-Host "==> Loading demo data" -ForegroundColor Cyan
  aws lambda invoke --function-name $fn --payload fileb://seed-event.json --region $Region seed-out.json | Out-Null
  Check "seed invoke"
  Get-Content seed-out.json
  Write-Host ""
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
if ($ExternalSite) { Write-Host "  Website: commit and push frontend/config.js; GitHub Pages publishes frontend/" }
else { Write-Host "  Website: $siteUrl" }
Write-Host "  API:     $apiUrl"
