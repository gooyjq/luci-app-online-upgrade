#!/bin/sh
# =====================================================
# Online Upgrade Script for ImmortalWrt/OpenWrt
# Part of luci-app-online-upgrade
# =====================================================
#
# Usage:
#   online-upgrade.sh check              Check for firmware updates
#   online-upgrade.sh upgrade            Backup + download + sysupgrade
#   online-upgrade.sh background         Run upgrade in background (for LuCI)
#   online-upgrade.sh backup             Only backup
#   online-upgrade.sh reset              Reset update check record

CONFIG_FILE="/etc/config/online-upgrade"

# Read UCI config
get_uci() { uci -q get "online-upgrade.settings.$1" 2>/dev/null; }
REPO="$(get_uci repo)"
TAG="$(get_uci tag)"
PROXY="$(get_uci proxy)"
FW_PATTERN="$(get_uci firmware_pattern)"
KEEP_CONFIG="$(get_uci keep_config)"

[ -z "$REPO" ] && REPO="gooyjq/ImmortalWrt-Builder"
[ -z "$TAG" ] && TAG="Autobuild-x86-64"
[ -z "$PROXY" ] && PROXY="https://ghfast.top/"
[ -z "$FW_PATTERN" ] && FW_PATTERN="combined-efi.*\\.img\\.gz"

API_URL="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
TMP_JSON="/tmp/release.json"
TMP_FIRMWARE="/tmp/firmware.img.gz"

MODE="${1:-check}"

echo "========================================"
echo "  固件在线升级"
echo "  仓库: ${REPO}  |  标签: ${TAG}"
echo "========================================"

# ===== 工具函数 =====
utc_to_local() {
    local utc_str="$1"
    local clean=$(echo "$utc_str" | sed 's/T/ /' | sed 's/Z//')
    local epoch=$(date -d "$clean" +%s 2>/dev/null)
    [ -z "$epoch" ] || [ "$epoch" = "0" ] && { echo "$utc_str"; return; }
    epoch=$((epoch + 8 * 3600))
    date -d "@${epoch}" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$utc_str"
}

# 提取当前固件版本号（数值比较用）
get_current_version() {
    local ver=$(grep "DISTRIB_REVISION" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 | sed 's/r//')
    [ -z "$ver" ] && ver="0"
    echo "$ver"
}

# 提取固件版本号（从文件名提取，如 immortalwrt-25.12.0-x86-64-...）
extract_fw_version() {
    local filename="$1"
    # 匹配如 25.12.0, 23.05.3 等版本号
    local fwver=$(echo "$filename" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo "${fwver:-0}"
}

# 版本号字符串转可比较数值（如 25.12.0 → 251200）
ver_to_num() {
    echo "$1" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}' 2>/dev/null || echo "0"
}

# 对比版本（当前 < 新 返回 0）
is_newer_version() {
    local cur_num=$(ver_to_num "$1")
    local new_num=$(ver_to_num "$2")
    [ "$cur_num" -lt "$new_num" ] 2>/dev/null && return 0 || return 1
}

# ===== 后台升级模式 =====
if [ "$MODE" = "background" ] || [ "$MODE" = "--background" ] || [ "$MODE" = "--bg" ]; then
    setsid /bin/sh "$0" "upgrade" </dev/null >/tmp/online-upgrade.log 2>&1 &
    exit 0
fi

# ===== 重置 =====
if [ "$MODE" = "reset" ] || [ "$MODE" = "--reset" ]; then
    echo "更新记录已重置。"
    exit 0
fi

# ===== 仅备份 =====
if [ "$MODE" = "backup" ] || [ "$MODE" = "--backup" ]; then
    TS=$(date +%Y%m%d-%H%M%S)
    BAK="/tmp/pre-upgrade-backup-${TS}.tar.gz"
    echo "正在创建配置备份..."
    sysupgrade -b "$BAK"
    if [ $? -eq 0 ] && [ -s "$BAK" ]; then
        cp "$BAK" "/root/pre-upgrade-backup-${TS}.tar.gz"
        echo "备份成功: /root/pre-upgrade-backup-${TS}.tar.gz ($(du -h "$BAK" | cut -f1))"
        echo "备份中包含 $(tar tzf "$BAK" 2>/dev/null | wc -l) 个文件"
        echo "提示：sysupgrade 会使用 -f 参数自动恢复此备份"
    else
        echo "错误：备份失败！"
        exit 1
    fi
    exit 0
fi

# ===== 获取 Release 信息 =====
echo ""
echo "[1/2] 正在获取 Release 信息..."
GITHUB_TOKEN="$(uci -q get online-upgrade.settings.github_token 2>/dev/null)"
if [ -n "$GITHUB_TOKEN" ]; then
    HTTP_CODE=$(curl -sL -H "Authorization: Bearer $GITHUB_TOKEN" -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$API_URL")
else
    HTTP_CODE=$(curl -sL -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$API_URL")
fi
if [ "$HTTP_CODE" = "000" ]; then
    echo "警告：直连 GitHub API 失败，尝试通过代理..."
    PROXY_API="${PROXY}${API_URL}"
    if [ -n "$GITHUB_TOKEN" ]; then
        HTTP_CODE=$(curl -sL -H "Authorization: Bearer $GITHUB_TOKEN" -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$PROXY_API")
    else
        HTTP_CODE=$(curl -sL -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$PROXY_API")
    fi
fi
if [ "$HTTP_CODE" = "403" ]; then
    echo "警告：GitHub API 限速，等待后重试..."
    for r in 1 2 3; do
        sleep $((r * 15))
        echo "  第${r}次重试..."
        if [ -n "$GITHUB_TOKEN" ]; then
            HTTP_CODE=$(curl -sL -H "Authorization: Bearer $GITHUB_TOKEN" -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$API_URL")
        else
            HTTP_CODE=$(curl -sL -H "User-Agent: curl/online-upgrade" -o "$TMP_JSON" -w "%{http_code}" "$API_URL")
        fi
        [ "$HTTP_CODE" = "200" ] && break
    done
fi
if [ "$HTTP_CODE" = "403" ]; then
    echo "错误：GitHub API 访问超60次/小时受限（HTTP 403）"
    echo "请等待1小时后重试，或配置 github_token 提高限制到 5000次/小时"
    echo "      uci set online-upgrade.settings.github_token='你的token'"
    echo "      uci commit online-upgrade"
    rm -f "$TMP_JSON"
    exit 1
elif [ "$HTTP_CODE" != "200" ]; then
    echo "错误：GitHub API 返回 HTTP $HTTP_CODE"
    rm -f "$TMP_JSON"
    exit 1
fi

# ===== 查找固件 =====
echo ""
echo "[2/2] 正在查找最新固件..."
FILE_NAMES=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[*].name")
FILE_NAME=$(echo "$FILE_NAMES" | grep -E "$FW_PATTERN" | head -1)
if [ -z "$FILE_NAME" ]; then
    FILE_NAME=$(echo "$FILE_NAMES" | grep -E "combined.*\.img\.gz$" | head -1)
fi
if [ -z "$FILE_NAME" ]; then
    echo "错误：未找到匹配的固件文件"
    rm -f "$TMP_JSON"
    exit 1
fi

ASSET_UPDATED=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"${FILE_NAME}\"].updated_at")
ASSET_UPDATED_LOCAL=$(utc_to_local "$ASSET_UPDATED")
ASSET_SIZE=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"${FILE_NAME}\"].size")
DOWNLOAD_URL=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"${FILE_NAME}\"].browser_download_url")

# 提取版本号（从固件文件名）
FW_VERSION_RELEASE=$(extract_fw_version "$FILE_NAME")
rm -f "$TMP_JSON"

# ===== 获取当前固件版本 =====
CURRENT_RELEASE=$(grep "DISTRIB_RELEASE" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
CURRENT_REVISION=$(grep "DISTRIB_REVISION" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 | sed "s/r//")
CURRENT_ID=$(grep "DISTRIB_ID" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)

# ===== 版本对比（基于版本号 + 时间戳）=====
LAST_TS="$(uci -q get online-upgrade.settings.last_upgrade_ts 2>/dev/null)"
LAST_VERSION="$(uci -q get online-upgrade.settings.last_upgrade_version 2>/dev/null)"

NEW_FIRMWARE=0
UPDATE_REASON=""

# 判断是否有新固件
if [ -z "$LAST_TS" ] && [ -z "$LAST_VERSION" ]; then
    NEW_FIRMWARE=1
    UPDATE_REASON="首次检测"
elif [ "$FW_VERSION_RELEASE" != "0" ] && [ "$CURRENT_RELEASE" != "$FW_VERSION_RELEASE" ]; then
    # 基于版本号比较
    if is_newer_version "$CURRENT_RELEASE" "$FW_VERSION_RELEASE"; then
        NEW_FIRMWARE=1
        UPDATE_REASON="新版固件 v${FW_VERSION_RELEASE}（当前 v${CURRENT_RELEASE}）"
    elif [ -n "$LAST_VERSION" ] && [ "$LAST_VERSION" != "$FW_VERSION_RELEASE" ]; then
        # 记录的版本号不同但当前已是此版本—可能是重新编译
        NEW_FIRMWARE=1
        UPDATE_REASON="固件重新编译（v${FW_VERSION_RELEASE}）"
    else
        UPDATE_REASON="已是最新（v${CURRENT_RELEASE}）"
    fi
elif [ "$ASSET_UPDATED" != "$LAST_TS" ] 2>/dev/null; then
    # 版本号相同但时间戳不同—重新编译
    NEW_FIRMWARE=1
    UPDATE_REASON="固件重新编译（${ASSET_UPDATED_LOCAL}）"
else
    UPDATE_REASON="已是最新"
fi

# ===== 显示信息 =====
CURRENT_ID=$(grep "DISTRIB_ID" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
echo ""
echo "============================================"
echo "  固件状态"
echo "============================================"
echo "  当前固件: ${CURRENT_ID} ${CURRENT_RELEASE} (r${CURRENT_REVISION})"
echo "  新固件版本: v${FW_VERSION_RELEASE:-N/A}"
echo "  最新固件: ${FILE_NAME}"
echo "  文件大小: $(printf "%.0f MB" $((${ASSET_SIZE:-0} / 1024 / 1024)) 2>/dev/null)"
echo "  编译时间: ${ASSET_UPDATED_LOCAL}"
echo "  检测依据: ${UPDATE_REASON}"
echo "============================================"
[ "$NEW_FIRMWARE" = "1" ] && echo "" && echo "  >>> 发现新固件！"

# ===== 非升级模式直接退出 =====
if [ "$MODE" != "upgrade" ] && [ "$MODE" != "--upgrade" ]; then
    echo ""
    echo "  升级: online-upgrade.sh upgrade"
    exit 0
fi

# ====================================================================
#  升级执行
# ====================================================================
echo ""
echo "============================================"
echo "  [执行升级]"
echo "============================================"

# 初始化状态文件
echo "backing_up" > /tmp/online-upgrade-status

# ---- Step 1: 下载固件 ----
FULL_URL="${PROXY}${DOWNLOAD_URL}"
echo ""
echo "Step 1: 下载固件..."
DOWNLOAD_SKIP=0
if [ -f "$TMP_FIRMWARE" ] && [ -f "${TMP_FIRMWARE}.ts" ]; then
    LOCAL_TS=$(cat "${TMP_FIRMWARE}.ts")
    if [ "$LOCAL_TS" = "$ASSET_UPDATED" ]; then
        echo "  固件已下载，跳过（${ASSET_UPDATED_LOCAL}）"
        DOWNLOAD_SKIP=1
    fi
fi
if [ "$DOWNLOAD_SKIP" = "0" ]; then
    echo "downloading" > /tmp/online-upgrade-status
    echo "  URL: $(echo "$FULL_URL" | head -c 80)..."
    curl -sL -o "$TMP_FIRMWARE" "$FULL_URL" 2>&1
    CURL_EXIT=$?
    if [ "$CURL_EXIT" -ne 0 ] || [ ! -s "$TMP_FIRMWARE" ]; then
        echo "failed:下载失败（curl exit: $CURL_EXIT）" > /tmp/online-upgrade-status
        echo "错误：下载失败！（curl exit: $CURL_EXIT）"
        rm -f "$TMP_FIRMWARE"
        exit 1
    fi
    echo "$ASSET_UPDATED" > "${TMP_FIRMWARE}.ts"
    echo "  下载成功 ($(du -h "$TMP_FIRMWARE" | cut -f1))"
    echo "downloaded" > /tmp/online-upgrade-status
fi

# ---- Step 2: 记录版本信息到 UCI（备份前，确保备份含版本记录）----
echo ""
echo "Step 2: 记录固件版本..."
echo "saving_ts" > /tmp/online-upgrade-status
uci set online-upgrade.settings.last_upgrade_ts="$ASSET_UPDATED"
uci set online-upgrade.settings.last_upgrade_version="${FW_VERSION_RELEASE:-0}"
uci commit online-upgrade
sync
echo "  已记录版本: v${FW_VERSION_RELEASE:-N/A} (${ASSET_UPDATED_LOCAL})"

# ---- Step 3: 创建 sysupgrade 备份（传给 -f 参数）----
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_TMP="/tmp/pre-upgrade-backup-${TS}.tar.gz"
BACKUP_ROOT="/root/pre-upgrade-backup-${TS}.tar.gz"
echo ""
echo "Step 3: 创建 sysupgrade 配置备份..."
sysupgrade -b "$BACKUP_TMP"
if [ $? -ne 0 ] || [ ! -s "$BACKUP_TMP" ]; then
    echo "错误：配置备份失败！"
    exit 1
fi
# 同时保存到 /root/ 作为应急副本
cp "$BACKUP_TMP" "$BACKUP_ROOT"
echo "  备份成功: ${BACKUP_ROOT} ($(du -h "$BACKUP_TMP" | cut -f1))"
echo "  备份中包含 $(tar tzf "$BACKUP_TMP" 2>/dev/null | wc -l) 个文件"

# ---- Step 4: 执行 sysupgrade（带 -f 参数自动恢复配置）----
echo ""
echo "Step 4: 执行 sysupgrade（自动恢复配置）..."
echo "sysupgrade" > /tmp/online-upgrade-status
sync
sleep 1
echo "  命令: sysupgrade -f ${BACKUP_TMP} ${TMP_FIRMWARE}"
/sbin/sysupgrade -f "$BACKUP_TMP" "$TMP_FIRMWARE"

# 如果 sysupgrade 失败（返回了），清除记录避免误判
echo "错误：sysupgrade 执行失败！" >> /tmp/online-upgrade.log
uci -q delete online-upgrade.settings.last_upgrade_ts
uci -q delete online-upgrade.settings.last_upgrade_version
uci commit online-upgrade
exit 1
