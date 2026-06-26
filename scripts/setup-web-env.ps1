param(
  [string]$WebAppPath = "C:\Users\Ivaylo\Desktop\AI Receptionist\apps\web"
)

$ErrorActionPreference = "Stop"

function Read-RequiredValue {
  param([string]$Prompt)

  do {
    $value = Read-Host $Prompt
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
    Write-Host "Required value. Try again." -ForegroundColor Yellow
  } while ($true)
}

function Read-OptionalSecret {
  param([string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) {
    return ""
  }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$resolvedWebApp = (Resolve-Path -LiteralPath $WebAppPath).Path
$envPath = Join-Path $resolvedWebApp ".env.local"

Write-Host "=== AI Receptionist web env setup ===" -ForegroundColor Cyan
Write-Host "This writes secrets only to: $envPath"
Write-Host ""

$supabaseUrl = Read-RequiredValue "NEXT_PUBLIC_SUPABASE_URL"
$anonKey = Read-RequiredValue "NEXT_PUBLIC_SUPABASE_ANON_KEY or PUBLISHABLE_KEY"
$serviceKey = Read-OptionalSecret "SUPABASE_SERVICE_ROLE_KEY or SECRET_KEY"
$webhookSecret = Read-OptionalSecret "VAPI_WEBHOOK_SECRET (press Enter to leave disabled for local test)"

if ([string]::IsNullOrWhiteSpace($serviceKey)) {
  throw "Service role / secret key is required for the Vapi webhook to write to Supabase."
}

if (Test-Path -LiteralPath $envPath) {
  $backupPath = "$envPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $envPath -Destination $backupPath
  Write-Host "Existing .env.local backed up to: $backupPath"
}

$lines = @(
  "# Supabase",
  "NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anonKey",
  "SUPABASE_SERVICE_ROLE_KEY=$serviceKey",
  "",
  "# Vapi webhook authentication",
  "VAPI_WEBHOOK_SECRET=$webhookSecret"
)

Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "DONE. Restart the Next.js dev server after changing env vars." -ForegroundColor Green

