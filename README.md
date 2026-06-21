# luci-app-online-upgrade

ImmortalWrt / OpenWrt LuCI 插件 - 从 GitHub Releases 在线升级固件。

## 功能

- 支持自定义 GitHub 仓库、Release 标签
- 自动检测固件更新
- 一键在线升级，保留系统配置
- 支持 GitHub 下载加速代理
- 升级前自动备份配置到 boot 分区

## 使用方法

1. 安装后，在 LuCI 菜单 **系统 → 在线升级** 进入
2. 配置仓库信息（默认 gooyjq/ImmortalWrt-Builder）
3. 点击 **检查更新** 查看最新固件
4. 点击 **执行升级** 开始升级

## 编译

```bash
# 将本插件放到 openwrt/package/luci-app-online-upgrade/
cd openwrt
make package/luci-app-online-upgrade/compile V=s
```

## 手动安装

```bash
opkg install luci-app-online-upgrade_1.0.0_all.ipk
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

GPL-2.0-only
