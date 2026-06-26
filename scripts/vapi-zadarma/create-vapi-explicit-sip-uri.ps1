param(
  [string]$DefaultApiBaseUrl = "https://api.vapi.ai",
  [string]$DefaultAssistantName = "LeadSaver Booking Receptionist BG",
  [string]$DefaultSipUsername = "leadsaver35924372749"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resultPath = Join-Path $scriptDir "vapi-explicit-sip-uri-result.json"
$logPath = Join-Path $scriptDir "vapi-explicit-sip-uri.log"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$timestamp $Message" | Tee-Object -FilePath $logPath -Append
}

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
    [ValidateSet("GET", "POST")]
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
  Write-Host "=== Vapi explicit SIP URI setup ==="
  Write-Host "This creates a direct Vapi SIP URI and assigns the assistant."
  Write-Host ""

  $apiBase = Read-Host "Vapi API base URL [$DefaultApiBaseUrl]"
  if ([string]::IsNullOrWhiteSpace($apiBase)) {
    $apiBase = $DefaultApiBaseUrl
  }
  $script:VapiApiBaseUrl = $apiBase.Trim().TrimEnd("/")
  $script:VapiPrivateKey = (Read-Secret "Vapi Private Key").Trim()

  $sipUsername = Read-Host "SIP username [$DefaultSipUsername]"
  if ([string]::IsNullOrWhiteSpace($sipUsername)) {
    $sipUsername = $DefaultSipUsername
  }
  $sipUsername = $sipUsername.Trim().ToLower()
  $sipUsername = $sipUsername -replace "[^a-z0-9._-]", ""
  if ([string]::IsNullOrWhiteSpace($sipUsername)) {
    throw "SIP username cannot be empty."
  }

  $sipHost = if ($script:VapiApiBaseUrl -like "*api.eu.vapi.ai*") { "sip.eu.vapi.ai" } else { "sip.vapi.ai" }
  $sipUri = "sip:$sipUsername@$sipHost"
  $zadarmaServerAddress = "$sipUsername@$sipHost"

  Write-Log "Using Vapi API base URL: $script:VapiApiBaseUrl"
  Write-Log "Using SIP URI: $sipUri"

  Write-Log "Fetching Vapi assistants..."
  $assistants = Invoke-Vapi -Method GET -Path "/assistant"
  $assistant = $assistants | Where-Object { $_.name -eq $DefaultAssistantName } | Select-Object -First 1

  if ($null -eq $assistant) {
    Write-Host ""
    Write-Host "Could not find assistant named '$DefaultAssistantName'. Existing assistants:"
    $assistants | Select-Object name, id | Format-Table -AutoSize
    Write-Host ""
    $assistantId = Read-Host "Paste the assistant ID"
    $assistantName = "manual"
  }
  else {
    $assistantId = $assistant.id
    $assistantName = $assistant.name
    Write-Log "Found assistant: $assistantName ($assistantId)"
  }

  if ([string]::IsNullOrWhiteSpace($assistantId)) {
    throw "Assistant ID is required."
  }

  Write-Log "Creating Vapi SIP phone number..."
  $body = @{
    provider = "vapi"
    name = "LeadSaver Explicit SIP URI"
    sipUri = $sipUri
    assistantId = $assistantId
  }

  $phoneNumber = Invoke-Vapi -Method POST -Path "/phone-number" -Body $body
  Write-Log "Created phone number: $($phoneNumber.id)"

  $result = [ordered]@{
    status = "ok"
    apiBaseUrl = $script:VapiApiBaseUrl
    phoneNumberId = $phoneNumber.id
    assistantId = $assistantId
    assistantName = $assistantName
    sipUri = $sipUri
    zadarmaServerAddress = $zadarmaServerAddress
    nextStep = "Set Zadarma External Server / SIP URI to $zadarmaServerAddress, save, then call +359 2 437 2749."
  }

  $result | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8

  Write-Host ""
  Write-Host "DONE."
  Write-Host ""
  Write-Host "Set this in Zadarma External Server / SIP URI:"
  Write-Host $zadarmaServerAddress
  Write-Host ""
  Write-Host "Result saved to:"
  Write-Host $resultPath
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  $result = [ordered]@{
    status = "error"
    message = $_.Exception.Message
  }
  $result | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8
  Write-Host ""
  Write-Host "ERROR:"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Result saved to:"
  Write-Host $resultPath
  exit 1
}
