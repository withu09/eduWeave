#!/usr/bin/env bash
# Distributed alongside payload/ in the community update archive.
set -Eeuo pipefail

package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_arg="${1:-}"
if [[ -z "$project_arg" || ! -d "$project_arg" ]]; then
  echo "用法：bash install_community_update.sh /服务器上的项目目录 [环境文件]" >&2
  exit 1
fi
project_dir="$(cd -- "$project_arg" && pwd)"
if [[ ! -f "$project_dir/docker-compose.yml" || ! -f "$project_dir/docker-compose.prod.yml" ]]; then
  echo "所选目录中缺少原项目的 Docker Compose 配置，请核对项目目录。" >&2
  exit 1
fi
if [[ ! -d "$package_dir/payload/backend" || ! -d "$package_dir/payload/frontend/dist" ]]; then
  echo "更新包不完整：请先完整解压，再运行更新脚本。" >&2
  exit 1
fi
env_file="${2:-}"
if [[ -z "$env_file" ]]; then
  if [[ -f "$project_dir/.env.bailian" ]]; then
    env_file="$project_dir/.env.bailian"
  else
    env_file="$project_dir/.env"
  fi
elif [[ "$env_file" != /* ]]; then
  env_file="$project_dir/$env_file"
fi
if [[ ! -f "$env_file" ]]; then
  echo "找不到现有环境文件，请通过第二个参数指定。" >&2
  exit 1
fi

compose=(docker compose --project-directory "$project_dir" -f "$project_dir/docker-compose.yml" -f "$project_dir/docker-compose.prod.yml" --env-file "$env_file")
"${compose[@]}" config --quiet
backup_dir="$project_dir/backups/community-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p -- "$backup_dir/files"
echo "正在备份数据库与将要更新的文件：$backup_dir"
"${compose[@]}" exec -T eduweave-postgres pg_dump -U postgres -d eduweave -Fc > "$backup_dir/database.dump"
[[ -s "$backup_dir/database.dump" ]] || { echo "数据库备份为空，更新已停止。" >&2; exit 1; }

while IFS= read -r -d '' source_path; do
  relative_path="${source_path#"$package_dir/payload/"}"
  if [[ -f "$project_dir/$relative_path" ]]; then
    mkdir -p -- "$backup_dir/files/$(dirname -- "$relative_path")"
    cp -a -- "$project_dir/$relative_path" "$backup_dir/files/$relative_path"
  fi
done < <(find "$package_dir/payload" -type f -print0)

trap 'echo "更新未完成。文件与数据库备份位于：$backup_dir。请参照更新说明回退或重试。" >&2' ERR
cp -a -- "$package_dir/payload/." "$project_dir/"
find "$project_dir/frontend/dist" -type d -exec chmod 755 {} +
find "$project_dir/frontend/dist" -type f -exec chmod 644 {} +
echo "正在构建并更新后端和页面服务…"
"${compose[@]}" up -d --no-deps --build eduweave-api eduweave-gateway
for attempt in {1..60}; do
  if "${compose[@]}" exec -T eduweave-api python -c 'import urllib.request; r = urllib.request.urlopen("http://localhost:8000/api/community/posts?limit=1", timeout=3); assert r.status == 200' >/dev/null 2>&1; then
    echo "社区接口检查通过。请打开原网站，刷新后进入社区。"
    echo "备份目录：$backup_dir"
    exit 0
  fi
  sleep 2
done
echo "服务尚未通过检查，请查看后端日志：docker compose logs --tail=80 eduweave-api" >&2
exit 1
