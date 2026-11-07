#!/bin/sh
# 根据环境变量生成评审账号（HTTP Basic Auth）。
# REVIEW_USER / REVIEW_PASSWORD 都填写时启用；任一为空则不加密码（仅建议本机测试时使用）。
set -e
AUTH_CONF=/etc/nginx/conf.d/auth.inc

if [ -n "${REVIEW_USER}" ] && [ -n "${REVIEW_PASSWORD}" ]; then
  printf '%s:%s\n' "${REVIEW_USER}" "$(openssl passwd -apr1 "${REVIEW_PASSWORD}")" > /etc/nginx/.htpasswd
  printf 'auth_basic "EduWeave Review";\nauth_basic_user_file /etc/nginx/.htpasswd;\n' > "${AUTH_CONF}"
  echo "[eduweave] 评审账号已启用：${REVIEW_USER}"
else
  printf 'auth_basic off;\n' > "${AUTH_CONF}"
  echo "[eduweave] 警告：未设置 REVIEW_USER / REVIEW_PASSWORD，站点无密码保护"
fi
