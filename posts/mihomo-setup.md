---
title: 'Mihomo 代理服务 - 机顶盒 (192.168.31.82)'
date: 2026-07-21
---

# Mihomo 代理服务 - 机顶盒 (192.168.31.82)

## 基本信息

- **设备**: ARMv7 机顶盒 (armhf, glibc 2.31)
- **IP**: 192.168.31.82
- **SSH**: root@192.168.31.82 / 密码 123456
- **代理端口**: 7890 (mixed HTTP/SOCKS5)

## 安装

```bash
# 安装 deb 包
dpkg -i mihomo_1.19.3_armv7.deb
```

## 配置

- `/etc/mihomo/config.yaml` — 订阅配置
- `/etc/mihomo/geoip.metadb` — GeoIP 数据库 (country.mmdb 重命名)
- `/etc/mihomo/GeoSite.dat` — GeoSite 数据库
- `/etc/systemd/system/mihomo.service` — systemd 服务

## 管理命令

```bash
systemctl status mihomo    # 查看状态
systemctl restart mihomo   # 重启
systemctl stop mihomo      # 停止
systemctl start mihomo     # 启动
systemctl enable mihomo    # 开机自启
mihomo -d /etc/mihomo -t   # 测试配置
```

## 测试代理

```bash
curl -x http://192.168.31.82:7890 http://cp.cloudflare.com/generate_204
```

## 客户端配置

WiFi / 有线网络设置代理为 `192.168.31.82:7890` (HTTP/SOCKS5 混合端口)。

## 数据库更新

```bash
# 本地下载（通过代理 192.168.31.124:7890）
curl -sL -x http://192.168.31.124:7890 \
  "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb" \
  -o /tmp/country.mmdb

curl -sL -x http://192.168.31.124:7890 \
  "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat" \
  -o /tmp/geosite.dat

# SCP 到设备
sshpass -p '123456' scp /tmp/country.mmdb root@192.168.31.82:/etc/mihomo/geoip.metadb
sshpass -p '123456' scp /tmp/geosite.dat root@192.168.31.82:/etc/mihomo/GeoSite.dat

# 重启
sshpass -p '123456' ssh root@192.168.31.82 "systemctl restart mihomo"
```

## 资源占用

- **内存**: mihomo ~44MB，设备共 969MB，可用 838MB
- **磁盘**: /dev/root 7G，已用 775M，可用 6G
- **CPU**: ARMv7 (armhf)

## Web 管理界面

mihomo 已内置 API (`127.0.0.1:9090`，配置中 `external-controller`)。

可安装轻量级 Web Dashboard（推荐 metacubexd 或 yacd）：
- 仅需 ~2-5MB 磁盘空间，无额外内存占用
- 方式1: 在 config.yaml 中添加 `external-ui: /etc/mihomo/ui`，下载 dashboard 文件到该目录
- 方式2: 使用 Docker / nginx 独立部署
- 需要将 `external-controller` 改为 `0.0.0.0:9090` 才能从局域网访问

Web UI 已安装 (metacubexd v1.270.0)：
- 访问地址: http://192.168.31.82:9090
- mihomo API: `0.0.0.0:9090` (已开放局域网)
