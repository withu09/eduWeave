<#
.SYNOPSIS
  参赛提交前的自检脚本：模拟评审专家访问智能体链接，逐项检查是否可用。

.EXAMPLE
  # 本机测试生产模式
  powershell -ExecutionPolicy Bypass -File scripts\check_deploy.ps1 -BaseUrl http://localhost -User reviewer -Password 你的密码

  # 测试服务器
  powershell -ExecutionPolicy Bypass -File scripts\check_deploy.ps1 -BaseUrl http://服务器IP -User reviewer -Password 你的密码
#>
param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [string]$User = "",
  [string]$Password = "",
  [switch]$SkipChat
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$BaseUrl = $BaseUrl.TrimEnd('/')
$headers = @{}
if ($User) {
  $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${User}:${Password}"))
  $headers["Authorization"] = "Basic $token"
}
$script:failed = 0

function Get-Status($url, $hdrs, $method = "GET", $body = $null, $timeout = 30) {
  try {
    $params = @{ Uri = $url; Method = $method; Headers = $hdrs; UseBasicParsing = $true; TimeoutSec = $timeout }
    if ($body) { $params.Body = [Text.Encoding]::UTF8.GetBytes($body); $params.ContentType = "application/json; charset=utf-8" }
    $r = Invoke-WebRequest @params
    $text = if ($r.RawContentStream) { [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) } else { "$($r.Content)" }
    return @{ Code = [int]$r.StatusCode; Body = $text }
  } catch {
    if ($_.Exception.Response) { return @{ Code = [int]$_.Exception.Response.StatusCode; Body = "" } }
    return @{ Code = 0; Body = $_.Exception.Message }
  }
}

function Check($name, [bool]$ok, $detail = "") {
  if ($ok) { Write-Host "[通过] $name" -ForegroundColor Green }
  else { Write-Host "[失败] $name  $detail" -ForegroundColor Red; $script:failed++ }
}

Write-Host "== 检查 $BaseUrl ==" -ForegroundColor Cyan

$r = Get-Status "$BaseUrl/api/health" @{}
Check "后端健康检查 /api/health" ($r.Code -eq 200) "状态码 $($r.Code) $($r.Body)"
if ($r.Code -eq 200 -and $r.Body -notmatch '"model_configured"\s*:\s*true') {
  Write-Host "       提示：model_configured 不是 true，请检查 DASHSCOPE_API_KEY" -ForegroundColor Yellow
}

if ($User) {
  $r = Get-Status "$BaseUrl/" @{}
  Check "未登录访问被拦截（应返回 401）" ($r.Code -eq 401) "状态码 $($r.Code)"
}

$r = Get-Status "$BaseUrl/" $headers
Check "评审账号打开首页" ($r.Code -eq 200 -and $r.Body -match '<div id="root"') "状态码 $($r.Code)"

$r = Get-Status "$BaseUrl/api/kb/status" $headers
$difyConfigured = ($r.Code -eq 200 -and $r.Body -match '"configured"\s*:\s*true')
Check "Dify 知识库密钥状态 /api/kb/status" $difyConfigured "状态码 $($r.Code) $($r.Body)"

if ($difyConfigured) {
  $r = Get-Status "$BaseUrl/api/kb/test-connection" $headers "POST" "{}" 30
  Check "Dify 云端连通性 /api/kb/test-connection" ($r.Code -eq 200 -and $r.Body -match '"connected"\s*:\s*true') "状态码 $($r.Code) $($r.Body)"
}

$r = Get-Status "$BaseUrl/api/kb/tree" $headers
Check "知识库树 /api/kb/tree" ($r.Code -eq 200 -and $r.Body -match '"tree"') "状态码 $($r.Code)"

$r = Get-Status "$BaseUrl/api/kb/starmap/all" $headers
Check "星图数据 /api/kb/starmap/all" ($r.Code -eq 200) "状态码 $($r.Code)"

$r = Get-Status "$BaseUrl/api/console/calls" $headers
Check "智能体控制台调用记录 /api/console/calls" ($r.Code -eq 200 -and $r.Body -match '"calls"') "状态码 $($r.Code)"

$r = Get-Status "$BaseUrl/docs" $headers
Check "接口文档对公网隐藏（应返回 404）" ($r.Code -eq 404) "状态码 $($r.Code)"

if (-not $SkipChat) {
  Write-Host "正在调用 AI 对话（真实消耗模型额度，约 10-60 秒）..." -ForegroundColor Cyan
  $courseId = $null
  $firstTopic = $null
  try {
    $treeObj = (Get-Status "$BaseUrl/api/kb/tree" $headers).Body | ConvertFrom-Json
    if ($treeObj.tree -and $treeObj.tree.Count -gt 0) {
      $courseId = $treeObj.tree[0].id
      foreach ($mod in $treeObj.tree[0].children) {
        foreach ($node in $mod.children) {
          if ($node.title -and $node.title -notmatch '^[\d.、()（）\s]+$') {
            $firstTopic = $node.title
            break
          }
        }
        if ($firstTopic) { break }
      }
    }
  } catch {}
  $promptText = if ($firstTopic) { "我对「$firstTopic」不太理解，请结合当前课程为我安排入门学习路径" } else { "我已经了解数组，但不会单链表，请为我安排入门学习路径" }
  $payload = @{ user_input = $promptText; history = @(); course_id = $courseId } | ConvertTo-Json -Compress
  $r = Get-Status "$BaseUrl/api/chat" $headers "POST" $payload 180
  $hasText = $r.Body -match '(?m)^1:'
  $hasPlan = $r.Body -match '(?m)^9:'
  Check "AI 对话有回复内容（1: 事件）" ($r.Code -eq 200 -and $hasText) "状态码 $($r.Code)"
  Check "AI 对话生成学习路径（9: 事件）" $hasPlan "模型这次没有调用学习路径工具，可以再试一次"
  if ($r.Body -match '请先在项目的|API Key|error when|encountered an error') {
    Write-Host "       提示：回复中出现配置或异常提示，请查看后端日志确认" -ForegroundColor Yellow
  }
}

Write-Host ""
if ($script:failed -eq 0) { Write-Host "全部检查通过，可以把链接和账号提交到大赛平台。" -ForegroundColor Green }
else { Write-Host "共 $script:failed 项未通过，请先排查。" -ForegroundColor Red; exit 1 }
