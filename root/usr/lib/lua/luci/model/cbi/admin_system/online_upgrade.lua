local m = Map("online-upgrade", "固件在线升级", "从 GitHub Releases 自动检测并升级固件，保留配置。")

-- 配置区
local s = m:section(NamedSection, "settings", "settings", "仓库配置")

local repo = s:option(Value, "repo", "GitHub 仓库")
repo.default = "gooyjq/ImmortalWrt-Builder"
repo.rmempty = false

local tag = s:option(Value, "tag", "Release 标签")
tag.default = "Autobuild-x86-64"
tag.rmempty = false

local pattern = s:option(Value, "firmware_pattern", "固件匹配模式",
    "用于匹配固件文件名的正则表达式")
pattern.default = "combined-efi.*\\.img\\.gz"
pattern.rmempty = false

local proxy = s:option(Value, "proxy", "下载代理",
    "GitHub 下载加速代理，如 https://ghfast.top/")
proxy.default = "https://ghfast.top/"

-- 操作区
local as = m:section(NamedSection, "actions", "actions", "操作")

-- 监测版本按钮
local check_btn = as:option(Button, "check", "监测版本")
check_btn.inputstyle = "action"
check_btn.description = "检查 GitHub Releases 是否有新固件"
function check_btn.write()
    luci.sys.call("/usr/bin/online-upgrade.sh check > /tmp/online-upgrade.log 2>&1")
    luci.http.redirect(luci.dispatcher.build_url("admin", "system", "online_upgrade", "log"))
end

-- 在线更新按钮
local upgrade_btn = as:option(Button, "upgrade", "在线更新")
upgrade_btn.inputstyle = "action important"
upgrade_btn.description = "备份配置 → 下载固件 → 刷写 → 重启"
function upgrade_btn.write()
    luci.sys.call("/usr/bin/online-upgrade.sh background > /dev/null 2>&1 &")
    luci.http.redirect(luci.dispatcher.build_url("admin", "system", "online_upgrade", "progress"))
end

return m
