# Start the backend and frontend development servers in separate PowerShell windows.
# Prerequisites: backend/.venv and frontend/node_modules must already exist.
# Run this script from the project root using: .\start.ps1
# If scripts are blocked, run: powershell -ExecutionPolicy Bypass -File .\start.ps1
# Stop either server by pressing Ctrl+C in its respective terminal window.

$root = $PSScriptRoot

# Start Backend (API server with auto-reload)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\.venv\Scripts\python.exe run.py --reload"

# Start Frontend (development server)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

# Display local development URLs
Write-Host "Backend and frontend started successfully!" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8765"
Write-Host "Swagger:  http://127.0.0.1:8765/docs"