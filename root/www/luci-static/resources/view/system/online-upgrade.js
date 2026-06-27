"use strict";
"require view";
"require fs";
"require ui";

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	render: function() {
		var _this = this;
		var pollTimer = null;

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
					resultEl.style.color = '';
					var upgBtn = document.getElementById('btn-upgrade');
					var forceBtn = document.getElementById('btn-force');
					if (upgBtn) upgBtn.style.display = 'inline-block';
					if (forceBtn) forceBtn.style.display = 'none';
				} else if (text.indexOf('403') >= 0 || text.indexOf('60次') >= 0) {
					resultEl.textContent = '❌ 检查失败 - 访问超60次/小时受限';
					resultEl.style.color = '';
					var forceBtn = document.getElementById('btn-force');
					if (forceBtn) forceBtn.style.display = 'inline-block';
				} else if (text.indexOf('错误') >= 0) {
					resultEl.textContent = '❌ 检查失败';
					resultEl.style.color = '';
					var forceBtn = document.getElementById('btn-force');
					if (forceBtn) forceBtn.style.display = 'inline-block';
				} else {
					resultEl.textContent = '✓ 已是最新';
					resultEl.style.color = '#4CAF50';
					var forceBtn = document.getElementById('btn-force');
					if (forceBtn) forceBtn.style.display = 'inline-block';
					var upgBtn = document.getElementById('btn-upgrade');
					if (upgBtn) upgBtn.style.display = 'none';
				}

				// 解析并显示版本信息
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
					// 新版本号
					m = lines[i].match(/新固件版本:\s*(.+)/);
					if (m) {
						var el = document.getElementById('new-ver');
						if (el) el.textContent = m[1].trim();
					}
					// 检测依据
					m = lines[i].match(/检测依据:\s*(.+)/);
					if (m) {
						var el = document.getElementById('check-reason');
						if (el) el.textContent = m[1].trim();
					}
				}
			}).catch(function(e) {
				updateOutput('检测失败: ' + e.message);
				btn.disabled = false;
				btn.textContent = '检查更新';
			});
		}

		function showRebootOverlay() {
			if (document.getElementById('reboot-overlay')) return;
			var seconds = 100;
			var overlay = E('div', {id: 'reboot-overlay', style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;'}, [
				E('div', {style: 'font-size:28px;font-weight:600;margin-bottom:10px;'}, '🔄 路由器正在重启'),
				E('div', {style: 'font-size:14px;color:#aaa;margin-bottom:20px;'}, '固件刷写完成，配置将自动恢复，等待路由器重启...'),
				E('div', {id: 'countdown', style: 'font-size:48px;font-weight:700;'}, String(seconds)),
				E('div', {style: 'font-size:13px;color:#888;margin-top:8px;margin-bottom:24px;'}, '秒后自动刷新'),
				E('button', {style: 'padding:10px 30px;font-size:16px;border:2px solid #4CAF50;background:transparent;color:#4CAF50;border-radius:8px;cursor:pointer;', click: function() { window.location.reload(); }}, '立即刷新')
			]);
			document.body.appendChild(overlay);

			var countdownEl = document.getElementById('countdown');
			var timer = setInterval(function() {
				seconds--;
				if (countdownEl) countdownEl.textContent = String(seconds);
				if (seconds <= 0) {
					clearInterval(timer);
					window.location.reload();
				}
			}, 1000);
		}

		function startUpgrade(isForce) {
			var msg = isForce
				? '确定强制更新固件？\n\n即使当前已是最新版本，也会重新下载并刷写。\n配置将自动备份并在刷写后恢复。\n请勿断电！'
				: '确定执行在线固件升级？\n\n系统将自动备份配置 → 下载固件 → 刷写（自动恢复配置）→ 重启。\n请勿断电！';
			if (!confirm(msg)) return;

			var progArea = document.getElementById('progress-area');
			if (progArea) progArea.style.display = 'block';

			var upgBtn = document.getElementById('btn-upgrade');
			if (upgBtn) upgBtn.style.display = 'none';
			var forceBtn = document.getElementById('btn-force');
			if (forceBtn) forceBtn.style.display = 'none';

			var steps = [
				{p:5, t:'正在备份配置...'},
				{p:25, t:'正在下载固件...'},
				{p:50, t:'下载完成，准备刷写...'},
				{p:75, t:'正在刷写固件，配置将自动恢复！'},
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
					showRebootOverlay();
				}
			}, 2000);

			fs.exec('/usr/bin/online-upgrade.sh', ['background']);

			var pollFails = 0;
			if (pollTimer) clearInterval(pollTimer);
			pollTimer = setInterval(function() {
				fs.exec('/bin/cat', ['/tmp/online-upgrade-status']).then(function(r) {
					pollFails = 0;
					var status = (r.stdout || '').trim();
					if (status.indexOf('failed:') === 0) {
						clearInterval(interval);
						clearInterval(pollTimer);
						pollTimer = null;
						var errMsg = status.substring(7);
						updateOutput('\n❌ 升级失败：' + errMsg + '\n');
						var progArea = document.getElementById('progress-area');
						if (progArea) progArea.style.display = 'none';
						var btnCheck = document.getElementById('btn-check');
						if (btnCheck) { btnCheck.disabled = false; btnCheck.textContent = '检查更新'; }
						var forceBtn = document.getElementById('btn-force');
						if (forceBtn) forceBtn.style.display = 'inline-block';
					} else if (status.indexOf('sysupgrade') === 0) {
						clearInterval(pollTimer);
						pollTimer = null;
						showRebootOverlay();
					}
				}).catch(function() {});
			}, 3000);
		}

		function runUpgrade() { startUpgrade(false); }
		function runForceUpgrade() { startUpgrade(true); }

		function autoRestore() {
			// 自动恢复（从路由器本地备份文件）
			fs.exec('/bin/sh', ['-c', 'ls -t /root/pre-upgrade-backup-*.tar.gz 2>/dev/null | head -1']).then(function(r) {
				var latestBackup = (r.stdout || '').trim();
				if (latestBackup) {
					if (!confirm('确定从备份自动恢复配置？\n\n备份文件: ' + latestBackup + '\n\nsysupgrade 将使用此备份恢复所有配置（包括网络、WiFi、防火墙等）。')) return;
					updateOutput('正在恢复配置 (使用 sysupgrade -f)...\n');
					fs.exec('/bin/sh', ['-c', 'sysupgrade -f "' + latestBackup + '" && echo OK || echo FAIL']).then(function(r2) {
						if (r2.stderr) updateOutput('警告: ' + r2.stderr + '\n');
						var ok = (r2.stdout || '').indexOf('OK') >= 0;
						if (ok) {
							updateOutput('✅ 配置恢复成功！建议重启路由器使配置生效。\n');
							ui.addNotification(null, E('p', '✅ 配置已从 ' + latestBackup + ' 恢复'), 'info');
						} else {
							updateOutput('❌ 恢复失败\n');
						}
					});
				} else {
					updateOutput('未找到 /root/ 下的备份，尝试从 /etc/config/sysupgrade.tgz 恢复...\n');
					fs.exec('/bin/sh', ['-c', 'cd / && tar xzf /etc/config/sysupgrade.tgz etc/config/ 2>/dev/null && echo OK || echo FAIL']).then(function(r3) {
						var ok = (r3.stdout || '').indexOf('OK') >= 0;
						updateOutput(ok ? '✅ 配置已从 /etc/config/sysupgrade.tgz 恢复（部分恢复）\n建议重启或重新应用配置。\n' : '❌ 恢复失败，未找到任何备份文件\n');
						if (ok) ui.addNotification(null, E('p', '配置已从 /etc/config/sysupgrade.tgz 恢复（部分）'), 'info');
					});
				}
			});
		}

		function manualRestore() {
			// 手动恢复（从本地上传备份文件）
			var fileInput = document.getElementById('manual-backup-file');
			if (!fileInput) return;
			fileInput.click();
		}

		// 文件选择后的上传恢复处理
		function handleManualBackupFile(evt) {
			var file = evt.target.files[0];
			if (!file) return;
			evt.target.value = ''; // 清空以便再次选择同一文件

			if (!file.name.match(/\.(tar\.gz|tgz|gz)$/i)) {
				updateOutput('❌ 请选择 .tar.gz 格式的备份文件\n');
				return;
			}

			if (!confirm('确定从本地文件恢复配置？\n\n文件: ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)\n\n将上传该备份文件到路由器并恢复配置。')) return;

			updateOutput('正在上传备份文件 (' + file.name + ')...\n');

			var reader = new FileReader();
			reader.onload = function(e) {
				var arrayBuffer = e.target.result;

				updateOutput('正在执行恢复...\n');
				fetch('/cgi-bin/online-upgrade-restore', {
					method: 'POST',
					headers: { 'Content-Type': 'application/octet-stream' },
					body: arrayBuffer
				}).then(function(resp) {
					return resp.text();
				}).then(function(text) {
					var isOk = text.indexOf('OK:') === 0;
					var msg = text.replace(/^(OK|ERROR):/, '');
					updateOutput((isOk ? '✅ ' : '❌ ') + msg + '\n');
					if (isOk) {
						ui.addNotification(null, E('p', '✅ 配置已从本地上传的备份文件恢复'), 'info');
					}
				}).catch(function(err) {
					updateOutput('❌ 上传失败: ' + err.message + '\n');
				});
			};
			reader.readAsArrayBuffer(file);
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

		// 读取当前版本和备份状态
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
			// 检查备份文件
			fs.exec('/bin/sh', ['-c', "ls -t /root/pre-upgrade-backup-*.tar.gz 2>/dev/null | head -1 | while read f; do echo \"$f $(date -r \"$f\" '+%Y-%m-%d %H:%M:%S') $(du -h \"$f\" | cut -f1)\"; done"]).then(function(r) {
				var hint = document.getElementById('backup-hint');
				var backupInfoText = document.getElementById('backup-info-text');
				var dlBtn = document.getElementById('btn-download');
				if (!hint) return;
				var output = (r.stdout || '').trim();
				if (output) {
					var parts = output.split(' ');
					var name = parts[0].split('/').pop();
					var ts = parts[1] + ' ' + parts[2];
					var size = parts[3] || '';
					hint.innerHTML = '';
					hint.style.color = '#4CAF50';
				// 备份文件名点击
				var link = E('a', {
				    href: '/cgi-bin/luci/admin/system/online_upgrade/download',
				    style: 'color:#4CAF50;text-decoration:none;',
				    target: '_blank'
				}, '✅ 备份文件: ' + name + ' (' + ts + ', ' + size + ')');
					hint.appendChild(link);
					if (dlBtn) dlBtn.style.display = 'inline-block';
					if (backupInfoText) {
						backupInfoText.textContent = '备份文件: ' + name + ' | ' + ts + ' | ' + size;
						var parent = backupInfoText.closest('#backup-info');
						if (parent) parent.style.display = 'block';
					}
				} else {
					// 回退检查 /etc/config/sysupgrade.tgz
					fs.exec('/bin/sh', ['-c', 'date -r /etc/config/sysupgrade.tgz 2>/dev/null || echo ""']).then(function(r2) {
						var ts2 = (r2.stdout || '').trim();
						if (ts2) {
							hint.textContent = '⚠️ 配置文件备份时间 ' + ts2 + '（旧版备份，保留在此供异常恢复）';
							hint.style.color = '#ff9800';
						} else {
							hint.textContent = '⚠️ 无备份文件 - 升级前会自动创建';
							hint.style.color = '#999';
						}
					});
				}
			});
		}, 100);

		// ======== 构建页面 ========
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
					]),
					E('div', {style: 'padding:4px 0;', id: 'new-ver-row'}, [
						E('span', {style: 'color:#666;display:inline-block;width:80px;'}, '固件版本'),
						E('span', {id: 'new-ver', style: 'font-weight:600;'}, '-'),
						E('span', {id: 'check-reason', style: 'color:#888;margin-left:8px;font-size:12px;'}, '')
					])
				]),
				E('div', {style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;'}, [
					E('button', {id: 'btn-check', class: 'btn cbi-button-action', click: runCheck}, '检查更新'),
					E('button', {id: 'btn-upgrade', class: 'btn cbi-button-action important', style: 'display:none;background:#4CAF50;border-color:#4CAF50;', click: runUpgrade}, '立即升级'),
					E('button', {id: 'btn-force', class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;', click: runForceUpgrade}, '强制更新'),
					E('span', {id: 'check-result', style: 'color:#888;font-size:12px;margin-left:4px;'}, ''),
					E('button', {id: 'btn-download', class: 'btn cbi-button', style: 'display:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:4px;border:1px solid #2196F3;color:#2196F3;background:transparent;', click: function() { var p = window.location.pathname.match(/^\/.*\/admin/) || ['/cgi-bin/luci/admin']; var b = p[0].replace('/admin', ''); window.open(b + '/admin/system/online_upgrade/download', '_blank'); }}, '📥 下载备份'),
					E('button', {id: 'btn-auto-restore', class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:4px;border:1px solid #4CAF50;color:#4CAF50;background:transparent;', click: autoRestore, title: '从路由器本地的备份文件自动恢复'}, '自动恢复'),
					E('button', {id: 'btn-manual-restore', class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:4px;border:1px solid #ff9800;color:#ff9800;background:transparent;', click: manualRestore, title: '从本地上传备份文件恢复'}, '📂 手动恢复'),
					E('input', {id: 'manual-backup-file', type: 'file', accept: '.tar.gz,.tgz,.gz', style: 'display:none', change: handleManualBackupFile}),
					E('span', {id: 'backup-hint', style: 'color:#999;font-size:11px;margin-left:6px;'}, '')
				])
			]),

			// 仓库配置
			E('div', {'class': 'cbi-section', style: 'margin-bottom:16px;padding:20px;'}, [
				E('div', {style: 'font-size:16px;font-weight:600;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee;'}, '仓库配置'),
				E('div', {style: 'display:flex;flex-direction:column;gap:10px;'}, [
					E('div', {style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'}, [
						E('label', {style: 'min-width:100px;font-size:13px;color:#555;font-weight:500;'}, 'Release 地址'),
						E('div', {style: 'flex:1;min-width:200px;display:flex;align-items:center;gap:6px;'}, [
							E('input', {id: 'cfg-url', type: 'text', style: 'flex:1;padding:7px 10px;border:1px solid #ddd;border-radius:4px;font-size:13px;background:var(--input-bg,transparent);', value: 'https://github.com/gooyjq/ImmortalWrt-Builder/releases/tag/Autobuild-x86-64'}),
							E('button', {class: 'btn cbi-button', style: 'padding:7px 14px;border-radius:4px;cursor:pointer;', click: parseUrl}, '解析'),
							E('span', {style: 'font-size:12px;color:#888;'}, '自动解析仓库和标签')
						])
					]),
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

			// 备份信息
			E('div', {id: 'backup-info', style: 'display:none;margin-bottom:16px;'}, [
				E('div', {'class': 'cbi-section', style: 'padding:14px 20px;'}, [
					E('span', {style: 'font-size:13px;color:#666;'}, ''),
					E('span', {id: 'backup-info-text', style: 'font-size:13px;color:#4CAF50;'}, '')
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
