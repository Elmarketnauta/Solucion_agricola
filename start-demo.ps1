# Yunta — Script de inicio del prototipo
# Ejecutar con: .\start-demo.ps1

Write-Host "Iniciando Yunta..." -ForegroundColor Green

# Backend
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PSScriptRoot\backend'; `$env:WEBHOOK_SECRET='dev-secret-local'; `$env:NODE_ENV='development'; npx ts-node src/server.ts"
) -WindowStyle Normal

Start-Sleep -Seconds 3

# Frontend
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PSScriptRoot\frontend'; npx vite --port 5174"
) -WindowStyle Normal

Start-Sleep -Seconds 5

# Abrir el browser
Start-Process "http://localhost:5174"

Write-Host ""
Write-Host "App corriendo en http://localhost:5174" -ForegroundColor Cyan
Write-Host "API corriendo en http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cuenta de prueba:" -ForegroundColor Yellow
Write-Host "  Telefono: +51900000001" -ForegroundColor White
Write-Host "  PIN:      1234" -ForegroundColor White
