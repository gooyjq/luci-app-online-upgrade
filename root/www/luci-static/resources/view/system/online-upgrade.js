"use strict";
"require view";
"require fs";
"require ui";

return view.extend({
	render: function() {
		var output = function(t) {
			var a = document.getElementById("upgrade-result");
			a.style.display = "block";
			a.textContent = t;
		};
		var loadCfg = function() {
			fs.read("/etc/config/online-upgrade").then(function(d) {
				var m = d.match(/option (?:repo|tag|firmware_pattern|proxy) '([^']+)'/g);
				if (m) {
					for (var i = 0; i < m.length; i++) {
						var kv = m[i].match(/option (\w+) '([^']+)'/);
						if (kv) {
							var el = document.getElementById("cfg-" + kv[1].replace(/_/g, "-"));
							if (el) el.value = kv[2];
						}
					}
				}
			});
		};
		setTimeout(loadCfg, 100);
		var getVal = function(id) { return document.getElementById(id).value; };
		var parseUrl = function() {
			var url = document.getElementById("cfg-url").value.trim();
			var m = url.match(/github\.com\/([^\/]+\/[^\/]+)\/releases\/tag\/([^\/\s?#]+)/);
			if (m) {
				document.getElementById("cfg-repo").value = m[1];
				document.getElementById("cfg-tag").value = m[2];
				ui.addNotification(null, E("p", "已解析: 仓库=" + m[1] + ", 标签=" + m[2]), "info");
			} else {
				ui.addNotification(null, E("p", "URL 格式不正确"));
			}
		};
		var saveCfg = function() {
			var cmd = "uci set online-upgrade.settings.repo='" + getVal("cfg-repo").replace(/'/g,"'\\''") + "' && uci set online-upgrade.settings.tag='" + getVal("cfg-tag").replace(/'/g,"'\\''") + "' && uci set online-upgrade.settings.firmware_pattern='" + getVal("cfg-pattern").replace(/'/g,"'\\''") + "' && uci set online-upgrade.settings.proxy='" + getVal("cfg-proxy").replace(/'/g,"'\\''") + "' && uci commit online-upgrade";
			fs.exec("/bin/sh", ["-c", cmd]).then(function() {
				ui.addNotification(null, E("p", "配置已保存"), "info");
			});
		};
		var runCheck = function() {
			var b = document.getElementById("btn-check");
			b.disabled = true; b.firstChild.data = "正在检测...";
			output("正在检测，请稍候...\n");
			fs.exec("/usr/bin/online-upgrade.sh",["check"]).then(function(r) {
				output(r.stdout+(r.stderr?"\n"+r.stderr:""));
				b.disabled = false; b.firstChild.data = "监测版本";
			}).catch(function(e) {
				output("检测失败: "+e.message);
				b.disabled = false; b.firstChild.data = "监测版本";
			});
		};
		var runUpgrade = function() {
			if (!confirm("确定执行在线固件升级？系统将自动备份配置、下载固件、刷写并重启。")) return;
			var b = document.getElementById("btn-upgrade");
			b.disabled = true; b.firstChild.data = "正在更新...";
			output("正在后台启动升级...\n备份 → 下载固件 → 刷写 → 重启\n路由器将在下载完成后自动重启。");
			fs.exec("/usr/bin/online-upgrade.sh",["background"]);
			ui.awaitReconnect(window.location.host, "192.168.1.1", "immortalwrt.lan");
		};
		return E("div", {"class":"cbi-map"}, [
			E("h2",{"class":"cbi-page-title"},"固件在线升级"),
			/* 仓库配置 */
			E("fieldset",{"class":"cbi-section","style":"margin-bottom:20px;"},[
				E("legend",{},"仓库配置"),
				E("div",{"class":"cbi-section-node"},[
					E("div",{"class":"cbi-value"},[
						E("label",{"class":"cbi-value-title"},"Release 地址"),
						E("div",{"class":"cbi-value-field"},[
							E("div",{style:"display:flex;gap:5px;"},[
								E("input",{id:"cfg-url",type:"text",value:"https://github.com/gooyjq/ImmortalWrt-Builder/releases/tag/Autobuild-x86-64",style:"flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-size:13px;"}),
								E("button",{class:"btn cbi-button","click":parseUrl,style:"white-space:nowrap;"},"解析")
							]),
							E("span",{style:"color:#888;font-size:12px;"},"粘贴 Release 页面地址，自动解析仓库和标签")
						])
					]),
					E("hr",{style:"border:none;border-top:1px dashed #ddd;margin:10px 0;"}),
					E("div",{"class":"cbi-value"},[E("label",{"class":"cbi-value-title"},"GitHub 仓库"),E("div",{"class":"cbi-value-field"},[E("input",{id:"cfg-repo",type:"text",value:"gooyjq/ImmortalWrt-Builder",style:"width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"})])]),
					E("div",{"class":"cbi-value"},[E("label",{"class":"cbi-value-title"},"Release 标签"),E("div",{"class":"cbi-value-field"},[E("input",{id:"cfg-tag",type:"text",value:"Autobuild-x86-64",style:"width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"})])]),
					E("div",{"class":"cbi-value"},[E("label",{"class":"cbi-value-title"},"固件匹配模式"),E("div",{"class":"cbi-value-field"},[E("input",{id:"cfg-pattern",type:"text",value:"combined-efi.*\\.img\\.gz",style:"width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"})])]),
					E("div",{"class":"cbi-value"},[E("label",{"class":"cbi-value-title"},"下载代理(可选)"),E("div",{"class":"cbi-value-field"},[E("input",{id:"cfg-proxy",type:"text",style:"width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"})])]),
					E("div",{"class":"cbi-page-actions"},[E("button",{"class":"btn cbi-button-save","click":saveCfg},"保存配置")])
				])
			]),
			/* 操作 */
			E("fieldset",{"class":"cbi-section","style":"margin-bottom:20px;"},[
				E("legend",{},"操作"),
				E("div",{"class":"cbi-section-node"},[
					E("div",{"class":"cbi-value"},[
						E("label",{"class":"cbi-value-title"},"监测版本"),
						E("div",{"class":"cbi-value-field"},[
							E("button",{id:"btn-check","class":"btn cbi-button-action","click":runCheck},"监测版本"),
							E("span",{style:"margin-left:10px;color:#888;font-size:12px;"},"检查 GitHub 是否有新固件")
						])
					]),
					E("div",{"class":"cbi-value"},[
						E("label",{"class":"cbi-value-title"},"在线更新"),
						E("div",{"class":"cbi-value-field"},[
							E("button",{id:"btn-upgrade","class":"btn cbi-button-action important","click":runUpgrade},"在线更新"),
							E("span",{style:"margin-left:10px;color:#888;font-size:12px;"},"备份 → 下载固件 → 刷写 → 重启")
						])
					])
				])
			]),
			E("pre",{id:"upgrade-result",style:"background:var(--mui-palette-background-level1,#f4f4f4);padding:15px;border-radius:5px;overflow:auto;max-height:500px;font-size:13px;white-space:pre-wrap;word-break:break-all;display:none;margin-top:15px;"},"")
		]);
	}
});
