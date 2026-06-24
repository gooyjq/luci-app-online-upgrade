"use strict";
"require view";
"require fs";
"require ui";

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	render: function() {
		function runCheck() {
			var btn = document.getElementById('btn-check');
			if (!btn) return;
			btn.disabled = true;
			btn.textContent = '检查中...';
			updateOutput('正在检查固件更新，请稍候...\n');

			fs.exec('/usr/bin/online-upgrade.sh', ['check']).then(function(r) {
				var text = r.stdout + (r.stderr ? '\n' + r.stderr : '');
				updateOutput(text);
				btn.disabled = false;
				btn.textContent = '检查更新';

				var resultEl = document.getElementById('check-result');
				if (!resultEl) return;

				if (text.indexOf('发现新固件') >= 0) {
					resultEl.textContent = '✅ 发现新固件！';
					var upgBtn = document.getElementById('btn-upgrade');
					if (upgBtn) upgBtn.style.display = 'inline-block';
				} else if (text.indexOf('错误') >= 0) {
					resultEl.textContent = '❌ 检查失败';
				} else {
					resultEl.textContent = '✓ 已是最新';
				}

				var lines = text.split('\n');
				for (var i = 0; i < lines.length; i++) {
					var m = lines[i].match(/最新固件:\s*(\S+)/);
					if (m) {
						var el = document.getElementById('latest-ver');
						if (el) el.textContent = m[1];
					}
					m = lines[i].match(/文件大小:\s*(.+)/);
					if (m) {
						var el = document.getElementById('latest-size');
						if (el) el.textContent = m[1].trim();
					}
				}
			}).catch(function(e) {
				updateOutput('检测失败: ' + e.message);
				btn.disabled = false;
				btn.textContent = '检查更新';
			});
		}

		function runUpgrade() {
			if (!confirm('确定执行在线固件升级？\n\n系统将自动备份配置、下载固件、刷写并重启。\n请勿断电！')) return;

			var progArea = document.getElementById('progress-area');
			if (progArea) progArea.style.display = 'block';
			var upgBtn = document.getElementById('btn-upgrade');
			if (upgBtn) upgBtn.style.display = 'none';

			var steps = [
				{p:5, t:'正在备份配置...'},
				{p:25, t:'正在下载固件...'},
				{p:50, t:'下载中...'},
				{p:75, t:'下载完成，准备刷写...'},
				{p:90, t:'正在刷写固件，请勿断电！'},
				{p:100, t:'刷写完成，路由器即将重启...'}
			];
			var idx = 0;
			var interval = setInterval(function() {
				if (idx < steps.length) {
					var bar = document.getElementById('progress-bar');
					var label = document.getElementById('progress-label');
					var text = document.getElementById('progress-text');
					if (bar) bar.style.width = steps[idx].p + '%';
					if (label) label.textContent = steps[idx].p + '%';
					if (text) text.textContent = steps[idx].t;
					updateOutput(steps[idx].t + '\n');
					idx++;
				} else {
					clearInterval(interval);
				}
			}, 2000);

			fs.exec('/usr/bin/online-upgrade.sh', ['background']);
			ui.awaitReconnect(window.location.host, '192.168.1.1', 'immortalwrt.lan');
		}

		function runForceUpgrade() {
			if (!confirm('确定强制更新固件？\n\n即使当前已是最新版本，也会重新下载并刷写。\n请勿断电！')) return;

			var progArea = document.getElementById('progress-area');
			if (progArea) progArea.style.display = 'block';

			var steps = [
				{p:5, t:'正在备份配置...'},
				{p:25, t:'正在下载固件...'},
				{p:50, t:'下载中...'},
				{p:75, t:'下载完成，准备刷写...'},
				{p:90, t:'正在刷写固件，请勿断电！'},
				{p:100, t:'刷写完成，路由器即将重启...'}
			];
			var idx = 0;
			var interval = setInterval(function() {
				if (idx < steps.length) {
					var bar = document.getElementById('progress-bar');
					var label = document.getElementById('progress-label');
					var text = document.getElementById('progress-text');
					if (bar) bar.style.width = steps[idx].p + '%';
					if (label) label.textContent = steps[idx].p + '%';
					if (text) text.textContent = steps[idx].t;
					updateOutput(steps[idx].t + '\n');
					idx++;
				} else {
					clearInterval(interval);
				}
			}, 2000);

			fs.exec('/usr/bin/online-upgrade.sh', ['background']);
			ui.awaitReconnect(window.location.host, '192.168.1.1', 'immortalwrt.lan');
		}

		function updateOutput(t) {
			var el = document.getElementById('upgrade-result');
			if (el) { el.style.display = 'block'; el.textContent += t; }
		}

		function parseUrl() {
			var url = document.getElementById('cfg-url').value.trim();
			var m = url.match(/github\.com\/([^\/]+\/[^\/]+)\/releases\/tag\/([^\/\s?#]+)/);
			if (m) {
				document.getElementById('cfg-repo').value = m[1];
				document.getElementById('cfg-tag').value = m[2];
				ui.addNotification(null, E('p', '已解析: 仓库=' + m[1] + ', 标签=' + m[2]), 'info');
			} else {
				ui.addNotification(null, E('p', 'URL 格式不正确'));
			}
		}

		function saveCfg() {
			var g = function(id) { return (document.getElementById(id) || {}).value || ''; };
			var cmd = "uci set online-upgrade.settings.repo='" + g('cfg-repo').replace(/'/g,"'\\''") + "' && uci set online-upgrade.settings.tag='" + g('cfg-tag').replace(/'/g,"'\\''") + "' && uci commit online-upgrade";
			fs.exec('/bin/sh', ['-c', cmd]).then(function() {
				ui.addNotification(null, E('p', '配置已保存'), 'info');
			});
		}

		function toggleAdv() {
			var body = document.getElementById('adv-body');
			var arrow = document.getElementById('adv-arrow');
			if (!body) return;
			var hidden = body.style.display === 'none';
			body.style.display = hidden ? 'block' : 'none';
			if (arrow) arrow.textContent = hidden ? '▼' : '▶';
		}

		setTimeout(function() {
			fs.exec('/bin/cat', ['/etc/openwrt_release']).then(function(r) {
				var lines = (r.stdout || '').split('\n');
				for (var i = 0; i < lines.length; i++) {
					var m = lines[i].match(/DISTRIB_RELEASE='([^']+)'/);
					if (m) {
						var el = document.getElementById('cur-ver');
						if (el) el.textContent = m[1];
					}
					m = lines[i].match(/DISTRIB_REVISION='r?([^']+)'/);
					if (m) {
						var el = document.getElementById('cur-rev');
						if (el) el.textContent = 'r' + m[1];
					}
				}
			});
		}, 100);

		return E('div', {'class': 'cbi-map'}, [
			E('h2', {'class': 'cbi-page-title'}, '固件在线升级'),

			// 状态卡片
			E('div', {'class': 'cbi-section', style: 'margin-bottom:16px;padding:20px;'}, [
				E('div', {style: 'font-size:18px;font-weight:600;margin-bottom:12px;'}, [
					E('span', {style: 'display:inline-block;width:12px;height:12px;border-radius:50%;background:#4CAF50;margin-right:8px;'}),
					'固件状态'
				]),
				E('div', {style: 'font-size:14px;margin-bottom:12px;'}, [
					E('div', {style: 'padding:4px 0;'}, [
						E('span', {style: 'color:#666;display:inline-block;width:80px;'}, '当前版本'),
						E('span', {style: 'font-weight:600;'}, 'ImmortalWrt '),
						E('span', {id: 'cur-ver', style: 'font-weight:600;'}, '加载中...'),
						E('span', {id: 'cur-rev', style: 'color:#888;margin-left:4px;font-size:12px;'}, '')
					]),
					E('div', {style: 'padding:4px 0;'}, [
						E('span', {style: 'color:#666;display:inline-block;width:80px;'}, '最新版本'),
						E('span', {id: 'latest-ver'}, '-'),
						E('span', {id: 'latest-size', style: 'color:#888;margin-left:8px;font-size:12px;'}, '')
					])
				]),
				E('div', {style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;'}, [
					E('button', {id: 'btn-check', class: 'btn cbi-button-action', click: runCheck}, '检查更新'),
					E('button', {id: 'btn-upgrade', class: 'btn cbi-button-action important', style: 'display:none;', click: runUpgrade}, '立即升级'),
					E('button', {id: 'btn-force', class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;', click: runForceUpgrade}, '强制更新'),
					E('span', {id: 'check-result', style: 'color:#888;font-size:12px;margin-left:4px;'}, '')
				])
			]),

			// 仓库配置
			E('div', {'class': 'cbi-section', style: 'margin-bottom:16px;padding:20px;'}, [
				E('div', {style: 'font-size:16px;font-weight:600;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee;'}, '仓库配置'),
				E('div', {style: 'display:flex;flex-direction:column;gap:10px;'}, [
					// Release URL - 始终可见
					E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
						E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, 'Release 地址'),
						E('div', {style: 'flex:1;min-width:200px;display:flex;align-items:center;gap:6px;'}, [
							E('input', {id: 'cfg-url', type: 'text', style: 'flex:1;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);', value: 'https://github.com/gooyjq/ImmortalWrt-Builder/releases/tag/Autobuild-x86-64'}),
							E('button', {class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;', click: parseUrl}, '解析'),
							E('span', {style: 'font-size:12px;color:#888;'}, '自动解析仓库和标签')
						])
					]),
					// 可折叠高级配置
					E('div', {style: 'margin-top:4px;margin-bottom:4px;'}, [
						E('div', {style: 'cursor:pointer;font-size:13px;color:#5e72e4;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:4px 0;', click: toggleAdv}, [
							E('span', {id: 'adv-arrow'}, '▶'),
							' 高级配置'
						])
					]),
					E('div', {id: 'adv-body', style: 'display:none;'}, [
						E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
							E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, 'GitHub 仓库'),
							E('input', {id: 'cfg-repo', type: 'text', style: 'flex:1;min-width:200px;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);color:#888;', value: 'gooyjq/ImmortalWrt-Builder', readonly: 'readonly'})
						]),
						E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
							E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, 'Release 标签'),
							E('input', {id: 'cfg-tag', type: 'text', style: 'flex:1;min-width:200px;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);color:#888;', value: 'Autobuild-x86-64', readonly: 'readonly'})
						]),
						E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
							E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, '固件匹配'),
							E('div', {style: 'flex:1;min-width:200px;'}, [
								E('input', {id: 'cfg-pattern', type: 'text', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);color:#888;', value: 'auto（自动检测）', readonly: 'readonly'}),
								E('div', {style: 'font-size:11px;color:#888;margin-top:2px;'}, '自动根据路由器架构匹配固件文件')
							])
						]),
						E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
							E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, '下载代理(可选)'),
							E('input', {id: 'cfg-proxy', type: 'text', style: 'flex:1;min-width:200px;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);'}, 'https://ghfast.top/')
						])
					])
				]),
				E('div', {style: 'margin-top:14px;text-align:right;'}, [
					E('button', {class: 'btn cbi-button-save', style: 'padding:7px 20px;border-radius:4px;cursor:pointer;', click: saveCfg}, '保存配置')
				])
			]),

			// 进度条
			E('div', {id: 'progress-area', style: 'display:none;margin-bottom:16px;'}, [
				E('div', {'class': 'cbi-section', style: 'padding:20px;'}, [
					E('div', {style: 'font-size:14px;font-weight:600;margin-bottom:10px;'}, '升级进度'),
					E('div', {style: 'height:24px;background:#e9ecef;border-radius:12px;overflow:hidden;position:relative;'}, [
						E('div', {id: 'progress-bar', style: 'width:0%;height:100%;background:linear-gradient(90deg,#4CAF50,#8BC34A);border-radius:12px;transition:width 0.5s ease;'}),
						E('div', {id: 'progress-label', style: 'position:absolute;top:0;left:0;right:0;height:24px;line-height:24px;text-align:center;font-size:12px;font-weight:600;color:#333;'}, '0%')
					]),
					E('div', {id: 'progress-text', style: 'margin-top:8px;font-size:13px;color:#666;'}, '')
				])
			]),

			// 结果
			E('pre', {id: 'upgrade-result', style: 'background:var(--cbi-section-bg,#1e1e1e);color:#d4d4d4;padding:20px;border-radius:6px;overflow:auto;max-height:400px;font-size:13px;white-space:pre-wrap;display:none;border:1px solid var(--cbi-section-border,#ddd);box-shadow:0 1px 4px rgba(0,0,0,0.06);box-sizing:border-box;width:100%;'}, '')
		]);
	}
});
