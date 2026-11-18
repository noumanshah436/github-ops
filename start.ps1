# Open two separate PowerShell windows: the backend (http://127.0.0.1:8765) and the frontend (http://127.0.0.1:5173).
# Expects backend\.venv and frontend\node_modules to exist already. Close a window (or Ctrl+C in it) to stop it.
# Run:  .\start.ps1   (if scripts are blocked: powershell -ExecutionPolicy Bypass -File .\start.ps1)

$root = $PSScriptRoot
$servers = @(
    @{ Title = 'gh-ops backend :8765';  Dir = "$root\backend";  Command = '.\.venv\Scripts\python.exe run.py --reload' },
    @{ Title = 'gh-ops frontend :5173'; Dir = "$root\frontend"; Command = 'npm run dev' }
)

# Runs first in each window: turn on colour-code support (virtual terminal processing) for this
# console only, so uvicorn's and Vite's coloured output shows as colours instead of "←[32m" codes.
# If that isn't possible, ask the tools for plain output instead.
$enableColors = @'
try {
    Add-Type -Namespace GhOps -Name Console -MemberDefinition @"
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int handle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr handle, out uint mode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr handle, uint mode);
"@
    $out = [GhOps.Console]::GetStdHandle(-11)
    $mode = 0
    if (-not ([GhOps.Console]::GetConsoleMode($out, [ref]$mode) -and [GhOps.Console]::SetConsoleMode($out, $mode -bor 4))) { throw 'no VT' }
} catch {
    $env:NO_COLOR = '1'
}
'@

foreach ($server in $servers) {
    $script = "$enableColors`n`$Host.UI.RawUI.WindowTitle = '$($server.Title)'; Set-Location '$($server.Dir)'; $($server.Command)"
    # Encoded so the command reaches PowerShell intact (no splitting on ';' or spaces).
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    # conhost always opens its own console window, even when Windows Terminal is the default
    # terminal (which would otherwise put both servers into tabs of one window).
    # -NoExit keeps the window open after the server stops, so you can read any error.
    Start-Process conhost.exe -ArgumentList "powershell.exe -NoExit -EncodedCommand $encoded"
}

Write-Host 'Started in two windows. App: http://127.0.0.1:5173  Swagger: http://127.0.0.1:8765/docs'
