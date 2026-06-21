"use strict";"require view";"require ui";
return view.extend({
	render:function(){return E("div",{"class":"cbi-map"},[
		E("h2",{"class":"cbi-page-title"},"正在更新..."),
		E("div",{"class":"alert-message","style":"padding:30px;text-align:center;font-size:16px;"},[
			E("p",{"class":"spinning"},"系统正在后台下载固件并自动刷写，请勿断电！"),
			E("p",{},"更新完成后路由器将自动重启，页面会尝试重连。"),
			E("p",{"style":"margin-top:20px;color:#888;font-size:13px;"},"如果长时间无响应，请手动检查路由器状态。")
		]),
		E("div",{"class":"cbi-page-actions"},[
			E("button",{"class":"btn cbi-button","click":function(){ui.awaitReconnect(window.location.host,"192.168.1.1","immortalwrt.lan");}},"等待重连"),
			E("button",{"class":"btn cbi-button-action","style":"margin-left:10px","click":function(){window.location.href=L.url("admin/system/online_upgrade");}},"返回")
		])
	])}
});
