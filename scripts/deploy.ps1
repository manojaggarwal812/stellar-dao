<#
.SYNOPSIS
    Build, deploy, and initialize all three Stellar DAO contracts on Testnet.

.DESCRIPTION
    Expects the Stellar CLI (`stellar`) to be installed and an identity
    called 'testnet-admin' already configured & funded. The script:
      1. Builds WASM for gov_token, treasury, proposal_registry
      2. Deploys all three contracts
      3. Initializes gov_token (admin = testnet-admin)
      4. Initializes proposal_registry (wires gov_token + treasury)
      5. Initializes treasury (wires registry + gov_token)
      6. Mints 5,000 VOTE bootstrap funds into the treasury
      7. Writes .env.local in the project root so the frontend picks them up

.EXAMPLE
    pwsh ./scripts/deploy.ps1 -Identity testnet-admin
#>

param(
    [string]$Identity        = "testnet-admin",
    [string]$Network         = "testnet",
    # 1 hour voting window — short enough for live testnet demos
    [int]   $VotingPeriodSec = 3600,
    # 100 VOTE deposit, 7 decimals
    [string]$ProposalDeposit = "1000000000",
    # 10% quorum
    [int]   $QuorumBps       = 1000,
    # Assumed circulating supply hint = 10,000 VOTE → quorum = 1,000 VOTE = one faucet claim
    [string]$TotalSupplyHint = "100000000000",
    # Bootstrap mint into treasury so demo proposals can pay out
    [string]$TreasuryBootstrap = "50000000000"   # 5,000 VOTE
)

$ErrorActionPreference = "Stop"

function Invoke-Stellar {
    param([string[]]$Cmd)
    Write-Host "> stellar $($Cmd -join ' ')" -ForegroundColor DarkGray
    $out = & stellar @Cmd
    if ($LASTEXITCODE -ne 0) { throw "stellar failed: $($Cmd -join ' ')" }
    return ($out | Out-String).Trim()
}

Write-Host "==> Checking prerequisites" -ForegroundColor Cyan
& stellar --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Stellar CLI not found. See https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup" }

$adminAddr = Invoke-Stellar @("keys","address",$Identity)
Write-Host "    admin = $adminAddr" -ForegroundColor Green

Write-Host "==> Building contracts" -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../contracts"
try {
    & stellar contract build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
}
finally { Pop-Location }

$wasmDir = "$PSScriptRoot/../target/wasm32v1-none/release"
if (-not (Test-Path "$wasmDir/gov_token.wasm")) {
    $wasmDir = "$PSScriptRoot/../target/wasm32-unknown-unknown/release"
}
if (-not (Test-Path "$wasmDir/gov_token.wasm")) {
    throw "WASM artifacts not found under target/"
}

Write-Host "==> Deploying gov_token (VOTE)" -ForegroundColor Cyan
$GOV_TOKEN_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/gov_token.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    GOV_TOKEN_ID = $GOV_TOKEN_ID" -ForegroundColor Green

Write-Host "==> Deploying treasury" -ForegroundColor Cyan
$TREASURY_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/treasury.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    TREASURY_ID = $TREASURY_ID" -ForegroundColor Green

Write-Host "==> Deploying proposal_registry" -ForegroundColor Cyan
$REGISTRY_ID = Invoke-Stellar @(
    "contract","deploy","--wasm","$wasmDir/proposal_registry.wasm",
    "--source",$Identity,"--network",$Network)
Write-Host "    REGISTRY_ID = $REGISTRY_ID" -ForegroundColor Green

Write-Host "==> Initializing gov_token" -ForegroundColor Cyan
Invoke-Stellar @(
    "contract","invoke","--id",$GOV_TOKEN_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init","--admin",$adminAddr,"--decimal","7",
    "--name","DAO Vote","--symbol","VOTE") | Out-Null
Write-Host "    VOTE token initialized" -ForegroundColor Green

Write-Host "==> Initializing proposal_registry" -ForegroundColor Cyan
Invoke-Stellar @(
    "contract","invoke","--id",$REGISTRY_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init",
    "--admin",$adminAddr,
    "--gov_token",$GOV_TOKEN_ID,
    "--treasury",$TREASURY_ID,
    "--voting_period_secs",$VotingPeriodSec.ToString(),
    "--proposal_deposit",$ProposalDeposit,
    "--quorum_bps",$QuorumBps.ToString(),
    "--total_supply_hint",$TotalSupplyHint) | Out-Null
Write-Host "    Registry initialized (voting=$($VotingPeriodSec)s · quorum=$($QuorumBps/100)%)" -ForegroundColor Green

Write-Host "==> Initializing treasury" -ForegroundColor Cyan
Invoke-Stellar @(
    "contract","invoke","--id",$TREASURY_ID,
    "--source",$Identity,"--network",$Network,"--",
    "init",
    "--registry",$REGISTRY_ID,
    "--gov_token",$GOV_TOKEN_ID) | Out-Null
Write-Host "    Treasury initialized (registry-gated)" -ForegroundColor Green

Write-Host "==> Bootstrapping treasury with $TreasuryBootstrap raw VOTE" -ForegroundColor Cyan
Invoke-Stellar @(
    "contract","invoke","--id",$GOV_TOKEN_ID,
    "--source",$Identity,"--network",$Network,"--",
    "mint",
    "--to",$TREASURY_ID,
    "--amount",$TreasuryBootstrap) | Out-Null
Write-Host "    5,000 VOTE minted into treasury" -ForegroundColor Green

Write-Host "==> Writing .env.local" -ForegroundColor Cyan
$envFile = "$PSScriptRoot/../.env.local"
@"
VITE_GOV_TOKEN_ID=$GOV_TOKEN_ID
VITE_TREASURY_ID=$TREASURY_ID
VITE_REGISTRY_ID=$REGISTRY_ID
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_RPC_URL=https://soroban-testnet.stellar.org
"@ | Set-Content -Path $envFile -Encoding utf8

Write-Host "`n======================================" -ForegroundColor Green
Write-Host " Deployed to Testnet. IDs in .env.local" -ForegroundColor Green
Write-Host "======================================`n" -ForegroundColor Green
Write-Host " GOV_TOKEN  : $GOV_TOKEN_ID"
Write-Host " TREASURY   : $TREASURY_ID"
Write-Host " REGISTRY   : $REGISTRY_ID"
Write-Host ""
Write-Host "Next: npm run dev" -ForegroundColor Cyan
