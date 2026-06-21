"use strict";"require view";"require fs";"require ui";
return view.extend({
	load:function(){return L.resolveDefault(fs.read("/tmp/online-upgrade.log"),"暂无日志");},
	render:function(l){return E("div",{"class":"cbi-map"},[
		E("h2",{"class":"cbi-page-title"},"检测结果"),
		E("pre",{"style":"background:#f4f4f4;padding:15px;border-radius:5px;overflow:auto;max-height:600px;font-size:13px;white-space:pre-wrap;word-break:break-all;"},l),
		E("div",{"class":"cbi-page-actions"},[
			E("button",{"class":"btn cbi-button-action","click":function(){window.location.href=L.url("admin/system/online_upgrade");}},"返回"),
			E("button",{"class":"btn cbi-button","style":"margin-left:10px","click":function(){location.reload();}},"刷新")
		])
	])}
});
