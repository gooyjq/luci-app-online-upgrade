#
# Copyright (C) 2026 gooyjq
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-online-upgrade
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=gooyjq <gooyjq@users.noreply.github.com>
PKG_LICENSE:=GPL-2.0-only
PKG_LICENSE_FILES:=LICENSE

LUCI_DEPENDS:=+curl +jsonfilter

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-online-upgrade
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=Firmware online upgrade from GitHub
	PKGARCH:=all
	DEPENDS:=$(LUCI_DEPENDS)
endef

define Package/luci-app-online-upgrade/description
	Automatically check and upgrade ImmortalWrt/OpenWrt firmware
	from GitHub Releases. Supports custom repository, release tag,
	download proxy, and configuration preservation.
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-online-upgrade/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/online-upgrade.sh $(1)/usr/bin/online-upgrade.sh

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/online-upgrade $(1)/etc/config/online-upgrade

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-online-upgrade $(1)/etc/uci-defaults/99-online-upgrade

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller/admin_system
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/controller/admin_system/online_upgrade.lua \
		$(1)/usr/lib/lua/luci/controller/admin_system/online_upgrade.lua

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi/admin_system
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/model/cbi/admin_system/online_upgrade.lua \
		$(1)/usr/lib/lua/luci/model/cbi/admin_system/online_upgrade.lua

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/system
	$(INSTALL_DATA) ./root/www/luci-static/resources/view/system/online-upgrade.js \
		$(1)/www/luci-static/resources/view/system/online-upgrade.js

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
endef

define Package/luci-app-online-upgrade/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	. /lib/functions/luci.sh
	luci-reload
	rm -f /tmp/luci-indexcache
	exit 0
}
endef

$(eval $(call BuildPackage,luci-app-online-upgrade))
