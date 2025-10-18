# ZJump - 现代化堡垒机系统

<div align="center">

**基于 Go + React 的企业级堡垒机**

[![Go Version](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org)
[![License](https://img.shields.io/badge/License-GPLv3-green.svg)](LICENSE)

</div>

---

## 📸 界面预览

### 用户管理
<div align="center">
  <img src="img/users.jpg" alt="用户管理界面" width="800"/>
  <p><em>完善的用户管理系统，支持 SSH 密钥认证、用户组管理和账号过期控制</em></p>
</div>

### Web 终端
<div align="center">
  <img src="img/webshell.jpg" alt="Web终端界面" width="800"/>
  <p><em>现代化的 Web 终端，支持实时命令拦截、会话录制和文件传输</em></p>
</div>

---

## 核心特性

- 🔐 **SSH Gateway** - 标准 SSH 协议直连 `ssh user@server -p 2222`
- 🌐 **Web Terminal** - WebSocket 实时终端 + 文件上传下载
- 🚨 **命令拦截** - 实时检测危险命令，飞书/钉钉告警
- 📋 **工单审批** - 飞书/钉钉审批流 + 自动授权
- 👥 **三维权限** - 用户组 + 主机组 + 系统用户
- 🎥 **完整审计** - 会话录制 + 命令历史 + 文件传输
- 🔑 **双因子认证** - 密码 / SSH 密钥
- 🌐 **高可用** - 多实例 + 共享 SSH Host Key
- 📊 **资产同步** - Prometheus
- 🔍 **实时监控** - 主机在线状态、SSH 可用性

## 快速开始

### 前置要求

- Go 1.21+
- MySQL 5.7+
- Node.js 16+

### 3 步部署

```bash
# 1. 初始化数据库
mysql -h 127.0.0.1 -uroot -p < sql/init.sql

# 2. 配置
vim config/config.yaml

# 3. 启动
make build && ./bin/api-server
```

**访问**: http://localhost:8080 (默认账号: `admin` / `admin123`)

## 系统架构

### 单实例

```
┌─────────────────────────────────────────┐
│         ZJump API Server                │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ HTTP API    │  │  SSH Gateway     │  │
│  │ :8080       │  │  :2222           │  │
│  └─────────────┘  └──────────────────┘  │
└───────────────────┬─────────────────────┘
                    │
            ┌───────▼───────┐
            │  MySQL        │
            └───────────────┘
```

### 高可用

```
            Nginx (负载均衡)
                  │
     ┌────────────┼────────────┐
     │            │            │
Instance-1   Instance-2   Instance-3
:8080/:2222  :8080/:2222  :8080/:2222
     └────────────┴────────────┘
                  │
          ┌───────▼───────┐
          │  MySQL        │
          │ (共享 SSH Key)│
          └───────────────┘
```

## 权限模型

### 三层架构

```
用户组 (UserGroup) ──┐
                    │
主机组 (HostGroup) ──┼──▶ 授权规则 (PermissionRule)
                    │
系统用户 (SystemUser)─┘
```

### 核心概念

**Host（主机资产）**
- 只管理网络信息: IP、端口、设备类型、协议
- 不包含认证信息

**SystemUser（系统用户）**
- 管理认证凭证: username、password、privateKey
- 支持认证方式: `password`（密码）、`key`（SSH密钥）
- 可复用: 一个系统用户授权给多个主机

**PermissionRule（授权规则）**
- 关联: 用户组 + 主机组 + 系统用户
- 支持时间范围和自动过期
- 支持优先级

### 使用示例

```json
// 1. 添加主机（无需认证信息）
{
  "name": "Web Server",
  "ip": "192.168.1.100",
  "port": 22
}

// 2. 创建系统用户（管理认证）
{
  "name": "Root User",
  "username": "root",
  "authType": "password",
  "password": "******"
}

// 3. 配置授权规则
{
  "userGroupId": "dev-team",
  "hostGroupIds": ["test-servers"],
  "systemUserIds": ["root-user"],
  "validFrom": "2025-01-01",
  "validTo": "2025-12-31"
}
```

## 配置

核心配置 `config/config.yaml`:

```yaml
server:
  api_port: 8080
  ssh_port: 2222

database:
  host: 127.0.0.1
  port: 3306
  user: root
  password: 123456
  dbname: zjump

security:
  jwt_secret: "change-me"
  encrypt_key: "32-characters-key"  # 必须 32 字符
```

⚠️ **生产环境务必修改密钥！**

## 开发命令

```bash
# 后端
make build          # 构建
make run            # 运行
make clean          # 清理

# 前端
cd ui/zjump-web
npm install
npm run dev         # 开发模式
npm run build       # 生产构建
```

## 项目结构

```
zjump-backend/
├── cmd/
│   ├── api-server/     # 主服务
│   └── proxy-agent/    # 代理节点
├── internal/
│   ├── api/            # HTTP API
│   ├── sshserver/      # SSH Gateway
│   ├── bastion/        # 堡垒机核心
│   ├── service/        # 业务逻辑
│   ├── repository/     # 数据访问
│   └── model/          # 数据模型
├── ui/zjump-web/       # React 前端
├── sql/                # SQL 脚本
├── config/             # 配置文件
└── docs/               # 文档
```

## 文档

- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - 部署指南
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - 架构设计
- [API.md](docs/API.md) - API 文档
- [MIGRATION_REMOVE_AUTO_AUTH.md](docs/MIGRATION_REMOVE_AUTO_AUTH.md) - 认证优化迁移

## 常见问题

**数据库连接失败？**
```bash
systemctl status mysql
mysql -h 127.0.0.1 -uroot -p
```

**SSH 连接失败？**
```bash
netstat -tlnp | grep 2222
tail -f logs/zjump.log
```

**公钥认证失败？**
```bash
ssh -o PreferredAuthentications=publickey \
    -o NumberOfPasswordPrompts=0 \
    user@server -p 2222
```

## 技术栈

**后端**: Go 1.21+ / Gin / GORM / golang.org/x/crypto/ssh  
**前端**: React 18 / TypeScript / Material-UI  
**存储**: MySQL 5.7+ / Redis (可选)  
**协议**: SSH (完整支持) / RDP (开发中)

## 联系方式

**QQ 交流群**: 675310096

- 使用交流和技术讨论
- 问题反馈和建议
- 获取最新版本更新
- 商业授权咨询

## 许可证

GNU General Public License v3.0 (GPLv3)

个人使用、学习、研究免费。商业使用需授权，请联系 QQ 群。

---

<div align="center">

Made with ❤️ by ZJump Team

</div>
