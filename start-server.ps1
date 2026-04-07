Param(
    [int]$Port = 5500
)

Set-Location -LiteralPath "$PSScriptRoot"
Write-Host "Starting server on http://localhost:$Port/"
node server.js
