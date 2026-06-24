# luci-app-online-upgrade

ImmortalWrt / OpenWrt LuCI 插件 - 从 GitHub Releases 在线升级固件。

![Screenshot](screenshot.png)

## 功能

- 支持自定义 GitHub 仓库、Release 标签
- 自动检测固件更新
- 一键在线升级，保留系统配置
- 支持 GitHub 下载加速代理
- 升级前自动备份配置到 boot 分区
- 强制更新：即使已是最新版本也可重新刷写
- 自动检测路由器架构匹配固件文件
- 同时编译 .ipk (opkg) 和 .apk (apk) 两种格式

## 使用方法

1. 安装后，在 LuCI 菜单 **系统 → 在线升级** 进入
2. 粘贴 Release 地址自动解析，或手动配置仓库和标签
3. 点击 **检查更新** 查看最新固件
4. 点击 **立即升级** 或 **强制更新** 开始升级
5. 路由器将自动备份配置 → 下载固件 → 刷写 → 重启

## 编译

```bash
# 将本插件放到 openwrt/package/luci-app-online-upgrade/
cd openwrt
make package/luci-app-online-upgrade/compile V=s
```

## 手动安装

**opkg (ImmortalWrt 23.05 及更早):**
```bash
opkg install luci-app-online-upgrade_1.0.0_all.ipk
```

**apk (ImmortalWrt 25.12+):**
```bash
apk add --allow-untrusted luci-app-online-upgrade-1.0.0-r1.apk
```

## 依赖

- curl
- jsonfilter
- LuCI (luci-base)

## 配置

UCI 配置文件 `/etc/config/online-upgrade`：

```bash
config online-upgrade 'settings'
    option enabled '1'
    option repo 'gooyjq/ImmortalWrt-Builder'
    option tag 'Autobuild-x86-64'
    option proxy 'https://ghfast.top/'
    option firmware_pattern 'combined-efi.*\\.img\\.gz'
    option keep_config '1'
```

## 许可证

GNU GENERAL PUBLIC LICENSE
