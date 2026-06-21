module("luci.controller.admin_system.online_upgrade", package.seeall)
function index()
	local page = entry({"admin", "system", "online_upgrade"}, view("system/online-upgrade"), "在线升级", 60)
	page.acl_depends = { "luci-app-online-upgrade" }
end
