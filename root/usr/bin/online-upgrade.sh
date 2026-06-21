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
STATE_FILE="/tmp/.online_upgrade_ts"

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

# ===== 后台升级模式 =====
if [ "$MODE" = "background" ] || [ "$MODE" = "--background" ] || [ "$MODE" = "--bg" ]; then
    (/bin/sh "$0" "upgrade" >/dev/null 2>&1 &)
    exit 0
fi

# ===== 重置 =====
if [ "$MODE" = "reset" ] || [ "$MODE" = "--reset" ]; then
    rm -f "$STATE_FILE"
    echo "检测记录已重置。"
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
        echo "备份成功: $BAK ($(du -h "$BAK" | cut -f1))"
    else
        echo "错误：备份失败！"
        exit 1
    fi
    exit 0
fi

# ===== 获取 Release 信息 =====
echo ""
echo "[1/2] 正在获取 Release 信息..."
HTTP_CODE=$(curl -sL -o "$TMP_JSON" -w "%{http_code}" "$API_URL")
if [ "$HTTP_CODE" != "200" ]; then
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

ASSET_UPDATED=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"$FILE_NAME\"].updated_at")
ASSET_UPDATED_LOCAL=$(utc_to_local "$ASSET_UPDATED")
ASSET_SIZE=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"$FILE_NAME\"].size")
DOWNLOAD_URL=$(cat "$TMP_JSON" | jsonfilter -e "@.assets[@.name=\"$FILE_NAME\"].browser_download_url")
rm -f "$TMP_JSON"

# ===== 判断新固件 =====
NEW_FIRMWARE=0
LAST_TS=""
[ -f "$STATE_FILE" ] && LAST_TS=$(head -1 "$STATE_FILE")
if [ -z "$LAST_TS" ]; then
    NEW_FIRMWARE=1
    UPDATE_REASON="首次检测"
elif [ "$LAST_TS" != "$ASSET_UPDATED" ]; then
    NEW_FIRMWARE=1
    UPDATE_REASON="固件已重新编译（${ASSET_UPDATED_LOCAL}）"
else
    UPDATE_REASON="固件无变化（${ASSET_UPDATED_LOCAL}）"
fi
echo "$ASSET_UPDATED" > "$STATE_FILE"

# ===== 显示信息 =====
CURRENT_ID=$(grep "DISTRIB_ID" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
CURRENT_REL=$(grep "DISTRIB_RELEASE" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
CURRENT_REV=$(grep "DISTRIB_REVISION" /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 | sed "s/r//")
echo ""
echo "============================================"
echo "  固件状态"
echo "============================================"
echo "  当前固件: ${CURRENT_ID} ${CURRENT_REL} (r${CURRENT_REV})"
echo ""
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

# ---- 备份 ----
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_TMP="/tmp/pre-upgrade-backup-${TS}.tar.gz"
BACKUP_ROOT="/root/pre-upgrade-backup-${TS}.tar.gz"
echo ""
echo "Step 1: 创建配置备份..."
sysupgrade -b "$BACKUP_TMP"
if [ $? -ne 0 ] || [ ! -s "$BACKUP_TMP" ]; then
    echo "错误：配置备份失败！"
    exit 1
fi
cp "$BACKUP_TMP" "$BACKUP_ROOT"

# ---- 下载固件 ----
FULL_URL="${PROXY}${DOWNLOAD_URL}"
echo ""
echo "Step 2: 下载固件..."
curl -sL -o "$TMP_FIRMWARE" "$FULL_URL" --progress-bar 2>&1
if [ $? -ne 0 ] || [ ! -s "$TMP_FIRMWARE" ]; then
    echo "错误：下载失败！"
    rm -f "$TMP_FIRMWARE"
    exit 1
fi
echo "  下载成功 ($(du -h "$TMP_FIRMWARE" | cut -f1))"

# ---- 精简备份到 /boot/ ----
echo ""
echo "Step 3: 写入精简备份到 boot 分区..."
sysupgrade -b /tmp/bu_full.tar.gz 2>/dev/null
[ -f /tmp/bu_full.tar.gz ] && {
    tar xzf /tmp/bu_full.tar.gz -C /tmp 2>/dev/null
    rm -rf /tmp/etc/openclash/GeoIP.dat /tmp/etc/openclash/GeoSite.dat \
           /tmp/etc/openclash/ASN.mmdb /tmp/etc/openclash/Country.mmdb \
           /tmp/etc/openclash/cache.db /tmp/etc/openclash/core \
           /tmp/etc/openclash/rule_provider
    cd /tmp && tar czf /boot/sysupgrade.tgz etc usr lib bin root www 2>/dev/null
    cd / && sync
    rm -f /tmp/bu_full.tar.gz
}
# ---- sysupgrade ----
echo ""
echo "Step 4: 执行 sysupgrade..."
echo "  路由器即将重启，请勿断电！"
/sbin/sysupgrade "$TMP_FIRMWARE"
