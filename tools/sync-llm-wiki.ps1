$ErrorActionPreference = "Stop"

$blogRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourceRoot = "D:\projects\LLM_WIKI"
$targetRoot = Join-Path $blogRoot "llm-wiki"

if (-not (Test-Path $sourceRoot)) {
  git -c http.proxy=http://127.0.0.1:6984 -c https.proxy=http://127.0.0.1:6984 clone https://github.com/freezetheflame/LLM_WIKI.git $sourceRoot
}

git -C $sourceRoot -c http.proxy=http://127.0.0.1:6984 -c https.proxy=http://127.0.0.1:6984 pull --ff-only origin main
$commit = git -C $sourceRoot rev-parse --short HEAD

New-Item -ItemType Directory -Force $targetRoot | Out-Null
Copy-Item -Force (Join-Path $sourceRoot "README.md") (Join-Path $targetRoot "README.md")
Copy-Item -Force (Join-Path $sourceRoot "app\app.js") (Join-Path $targetRoot "app.js")
Copy-Item -Force (Join-Path $sourceRoot "app\wiki-core.js") (Join-Path $targetRoot "wiki-core.js")
Copy-Item -Force (Join-Path $sourceRoot "app\wiki-data.js") (Join-Path $targetRoot "wiki-data.js")
foreach ($dir in @("wiki", "agent", "raw", "docs")) {
  $target = Join-Path $targetRoot $dir
  if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
  }
  Copy-Item -Recurse -Force (Join-Path $sourceRoot $dir) $target
}

$appPath = Join-Path $targetRoot "app.js"
$app = [System.IO.File]::ReadAllText($appPath, [System.Text.UTF8Encoding]::new($false))
$app = $app.Replace('fetch(`../${path}`)', 'fetch(`/llm-wiki/${path}`)')
[System.IO.File]::WriteAllText($appPath, $app, [System.Text.UTF8Encoding]::new($false))

@"
# LLM Wiki Source

- Source repository: ``https://github.com/freezetheflame/LLM_WIKI``
- Synced branch: ``main``
- Synced commit: ``$commit``
- Integration mode: vendored static copy with blog-specific path and style adaptation

This directory is intentionally committed as static files instead of a Git submodule so GitHub Pages can publish it directly and reliably.
"@ | Set-Content -Encoding utf8 (Join-Path $targetRoot "SOURCE.md")
