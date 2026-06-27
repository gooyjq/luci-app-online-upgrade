module("luci.controller.admin_system.online_upgrade", package.seeall)

function index()
	local page = entry({"admin", "system", "online_upgrade"}, view("system/online-upgrade"), "在线升级", 60)
	page.acl_depends = { "luci-app-online-upgrade" }

	-- 备份下载端点
	entry({"admin", "system", "online_upgrade", "download"}, call("action_download")).leaf = true
end

function action_download()
	local fs = require("nixio.fs")
	local sys = require("luci.sys")

	local filepath = sys.exec("ls -t /root/pre-upgrade-backup-*.tar.gz 2>/dev/null | head -1")
	filepath = filepath:gsub("%s+$", "")

	if not filepath or filepath == "" then
		luci.http.status(404, "Not Found")
		luci.http.write("备份文件不存在")
		return
	end

	if not fs.access(filepath, "r") then
		luci.http.status(500, "Internal Error")
		luci.http.write("无法读取备份文件")
		return
	end

	local filename = filepath:match("[^/]+$")
	luci.http.header("Content-Type", "application/gzip")
	luci.http.header("Content-Disposition", 'attachment; filename="' .. filename .. '"')

	luci.http.prepare_content("application/gzip")
	local f = io.open(filepath, "rb")
	if f then
		while true do
			local block = f:read(8192)
			if not block then break end
			luci.http.write(block)
		end
		f:close()
	end
end
