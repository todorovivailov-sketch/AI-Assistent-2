param(
  [string]$DefaultApiBaseUrl = "https://api.vapi.ai"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resultPath = Join-Path $scriptDir "vapi-diagnosis-result.json"

function Read-Secret {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Invoke-Vapi {
  param(
    [ValidateSet("GET", "PATCH")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{
    Authorization = "Bearer $script:VapiPrivateKey"
    "Content-Type" = "application/json"
  }

  $uri = "$script:VapiApiBaseUrl$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }

  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

try {
  Write-Host ""
  Write-Host "=== Vapi phone-number diagnosis ==="
  Write-Host ""

  $apiBase = Read-Host "Vapi API base URL [$DefaultApiBaseUrl]"
  if ([string]::IsNullOrWhiteSpace($apiBase)) {
    $apiBase = $DefaultApiBaseUrl
  }
  $script:VapiApiBaseUrl = $apiBase.Trim().TrimEnd("/")
  $script:VapiPrivateKey = (Read-Secret "Vapi Private Key").Trim()

  $assistants = Invoke-Vapi -Method GET -Path "/assistant"
  $phoneNumbers = Invoke-Vapi -Method GET -Path "/phone-number"
  $calls = Invoke-Vapi -Method GET -Path "/call"

  $summary = [ordered]@{
    status = "ok"
    apiBaseUrl = $script:VapiApiBaseUrl
    assistants = @($assistants | Select-Object id, name)
    phoneNumbers = @($phoneNumbers | Select-Object id, name, provider, number, sipUri, assistantId, status, credentialId)
    latestCalls = @($calls | Select-Object -First 10 id, type, status, endedReason, phoneNumberId, assistantId, createdAt, startedAt, endedAt)
  }

  $summary | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8

  Write-Host ""
  Write-Host "Phone numbers:"
  $summary.phoneNumbers | Format-Table -AutoSize

  Write-Host ""
  Write-Host "Latest calls:"
  $summary.latestCalls | Format-Table -AutoSize

  Write-Host ""
  Write-Host "Saved diagnosis to:"
  Write-Host $resultPath
}
catch {
  $summary = [ordered]@{
    status = "error"
    message = $_.Exception.Message
  }
  $summary | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8
  Write-Host ""
  Write-Host "ERROR:"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Saved diagnosis to:"
  Write-Host $resultPath
  exit 1
}
