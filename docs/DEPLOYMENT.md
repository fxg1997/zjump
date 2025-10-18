# ZJump 部署指南

本文档说明如何部署 ZJump 堡垒机系统，包括单实例部署和多实例高可用部署。

## 目录

- [系统要求](#系统要求)
- [单实例部署](#单实例部署)
- [多实例部署（推荐）](#多实例部署推荐)
- [SSH Host Key 管理](#ssh-host-key-管理)
- [Nginx 配置](#nginx-配置)
- [常见问题](#常见问题)

---

## 系统要求

### 硬件要求
- **CPU**: 2核以上
- **内存**: 4GB以上（推荐8GB）
- **磁盘**: 50GB以上

### 软件要求
- **操作系统**: Linux (Ubuntu 20.04+, CentOS 7+, Debian 10+)
- **数据库**: MySQL 5.7+ 或 MariaDB 10.3+
- **Go**: 1.21+ (仅编译时需要)
- **Redis**: 6.0+ (可选，用于分布式锁和缓存)

---

## 单实例部署

### 1. 准备数据库

```bash
# 创建数据库
mysql -u root -p < sql/init.sql

# 或者手动创建
mysql -u root -p
CREATE DATABASE zjump CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zjump;
SOURCE sql/init.sql;
```

### 2. 配置文件

编辑 `config/config.yaml`:

```yaml
server:
  api_port: 8080
  ssh_port: 2222
  mode: release
  proxy_id: ""  # 留空自动生成
  
database:
  host: 127.0.0.1
  port: 3306
  user: root
  password: your_password
  dbname: zjump

security:
  jwt_secret: "your-secret-key-change-in-production"
  encrypt_key: "32-char-encryption-key-here!!"

logging:
  level: info
  output: both
  file: logs/zjump.log
```

### 3. 编译和运行

```bash
# 编译
make build

# 运行 API Server
./bin/api-server

# 或使用 systemd 服务
sudo systemctl start zjump
```

### 4. 验证部署

```bash
# 检查 API 服务
curl http://localhost:8080/api/health

# 检查 SSH Gateway
ssh admin@localhost -p 2222
```

---

## 多实例部署（推荐）

ZJump 支持多实例部署，提供高可用性和负载均衡。

### 架构说明

```
                    ┌─────────────┐
                    │   Nginx/    │
                    │   HAProxy   │  (负载均衡)
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
    │ ZJump-1 │       │ ZJump-2 │       │ ZJump-3 │
    │ :8080   │       │ :8080   │       │ :8080   │
    │ :2222   │       │ :2222   │       │ :2222   │
    └────┬────┘       └────┬────┘       └────┬────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │    MySQL    │  (共享数据库)
                    │  (主从复制)  │
                    └─────────────┘
```

### 1. SSH Host Key 共享策略 ⭐

**重要**: 多实例部署时，所有实例必须共享相同的 SSH host key，否则客户端会收到"主机密钥已更改"的安全警告。

ZJump 提供了**数据库共享密钥**方案（默认启用）：

#### 数据库共享密钥（推荐✅）

所有实例从数据库的 `ssh_host_keys` 表中读取或生成共享的 SSH host key。

**优点**:
- ✅ 自动同步，无需手动分发
- ✅ 首次启动自动生成，后续实例自动加载
- ✅ 支持密钥轮换和管理
- ✅ 客户端只需信任一次

**配置** (默认已启用):

```yaml
# config/config.yaml
server:
  # proxy_id 用于标识不同实例，但不影响共享密钥
  proxy_id: "instance-1"  
  
# 代码中默认配置
UseSharedHostKey: true  # 启用数据库共享密钥
```

**工作流程**:

1. 第一个实例启动时，从数据库查询 SSH host key
2. 如果不存在，生成新的 RSA 2048 密钥并保存到数据库
3. 后续实例启动时，从数据库加载相同的密钥
4. 所有实例使用相同的密钥指纹，客户端无感知

**密钥存储表**:

```sql
CREATE TABLE ssh_host_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_type VARCHAR(20) DEFAULT 'rsa',
    key_name VARCHAR(50) DEFAULT 'default',
    private_key TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint VARCHAR(255) NOT NULL,
    key_size INT DEFAULT 2048,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_key_type_name (key_type, key_name)
);
```

### 2. 部署多个实例

#### 实例 1

```yaml
# /opt/zjump/instance1/config/config.yaml
server:
  api_port: 8080
  ssh_port: 2222
  proxy_id: "instance-1"  # 实例标识

database:
  host: 192.168.1.100  # 共享数据库
  port: 3306
  user: zjump
  password: password
  dbname: zjump
```

```bash
cd /opt/zjump/instance1
./bin/api-server
```

#### 实例 2

```yaml
# /opt/zjump/instance2/config/config.yaml
server:
  api_port: 8080
  ssh_port: 2222
  proxy_id: "instance-2"  # 不同的实例标识

database:
  host: 192.168.1.100  # 相同的共享数据库
  port: 3306
  user: zjump
  password: password
  dbname: zjump
```

```bash
cd /opt/zjump/instance2
./bin/api-server
```

#### 实例 3

```yaml
# /opt/zjump/instance3/config/config.yaml
server:
  api_port: 8080
  ssh_port: 2222
  proxy_id: "instance-3"

database:
  host: 192.168.1.100  # 相同的共享数据库
  port: 3306
  user: zjump
  password: password
  dbname: zjump
```

```bash
cd /opt/zjump/instance3
./bin/api-server
```

### 3. 验证多实例部署

```bash
# 检查所有实例状态
curl http://192.168.1.101:8080/api/health
curl http://192.168.1.102:8080/api/health
curl http://192.168.1.103:8080/api/health

# 检查 SSH 密钥一致性（非常重要！）
ssh-keyscan -p 2222 192.168.1.101 > key1.txt
ssh-keyscan -p 2222 192.168.1.102 > key2.txt
ssh-keyscan -p 2222 192.168.1.103 > key3.txt
diff key1.txt key2.txt  # 应该相同
diff key2.txt key3.txt  # 应该相同

# 通过负载均衡器连接
ssh admin@zjump.example.com -p 2222
```

---

## SSH Host Key 管理

### 查看当前密钥指纹

```bash
# 启动日志中会显示
[SSH Server] 🔐 Key fingerprint: SHA256:xxx...
```

### 查询数据库中的密钥

```sql
USE zjump;
SELECT 
    id, 
    key_type, 
    key_name, 
    fingerprint, 
    key_size,
    created_at 
FROM ssh_host_keys;
```

### 密钥轮换（高级）

如果需要更换 SSH host key（会导致所有客户端需要重新信任）：

```sql
-- 删除旧密钥
DELETE FROM ssh_host_keys WHERE key_type = 'rsa' AND key_name = 'default';

-- 重启所有实例，第一个实例会生成新密钥
systemctl restart zjump
```

### 手动备份密钥

```bash
# 备份密钥
mysqldump zjump ssh_host_keys > ssh_host_keys_backup.sql

# 恢复密钥
mysql zjump < ssh_host_keys_backup.sql
```

---

## Nginx 配置

详细的 Nginx 配置请参考项目根目录的 `nginx.conf` 文件。

### HTTP/WebSocket 代理

```nginx
upstream zjump_backend {
    ip_hash;  # WebSocket 会话保持
    server 192.168.1.101:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.102:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.103:8080 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name zjump.example.com;
    
    location /api/ {
        proxy_pass http://zjump_backend;
        # ... 其他配置
    }
    
    location /ws/ {
        proxy_pass http://zjump_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # ... 其他配置
    }
}
```

### SSH TCP 代理

```nginx
stream {
    upstream ssh_backend {
        server 192.168.1.101:2222 max_fails=3 fail_timeout=10s;
        server 192.168.1.102:2222 max_fails=3 fail_timeout=10s;
        server 192.168.1.103:2222 max_fails=3 fail_timeout=10s;
    }
    
    server {
        listen 2222;
        proxy_pass ssh_backend;
        proxy_timeout 1h;
    }
}
```

---

## Systemd 服务

创建 `/etc/systemd/system/zjump.service`:

```ini
[Unit]
Description=ZJump Bastion Host
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/zjump
ExecStart=/opt/zjump/bin/api-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl start zjump
sudo systemctl enable zjump
sudo systemctl status zjump
```

---

## 数据库主从复制（可选）

为了提高数据库可用性，建议配置 MySQL 主从复制：

```bash
# 主库配置
[mysqld]
server-id=1
log-bin=mysql-bin
binlog-format=ROW

# 从库配置
[mysqld]
server-id=2
relay-log=mysql-relay-bin
read-only=1
```

---

## 常见问题

### 1. SSH 客户端提示"主机密钥已更改"

**原因**: 不同实例使用了不同的 SSH host key。

**解决方案**: 
- 确认所有实例都连接到同一个数据库
- 确认配置中 `UseSharedHostKey` 为 `true`（默认）
- 检查数据库连接是否正常
- 查看启动日志确认加载了共享密钥
- 重启所有实例

### 2. 数据库连接失败

**排查步骤**:
```bash
# 测试数据库连接
mysql -h 192.168.1.100 -u zjump -p -D zjump

# 检查防火墙
sudo firewall-cmd --list-all

# 查看日志
tail -f logs/zjump.log
```

### 3. 负载均衡器无法连接后端

**检查事项**:
- 确认所有实例都在运行
- 检查端口是否正确
- 验证防火墙规则
- 测试直连各个实例

### 4. 首次部署后无法登录

**默认账号**:
- 用户名: `admin`
- 密码: `admin123`

**重置密码**:
```sql
-- 密码: admin123
UPDATE users 
SET password = '$2a$10$znAuyeo3.VQ4AxbmLhR8zOAQjdlnnl7kAU/TAnSe0gbvOk/I4wWmC' 
WHERE username = 'admin';
```

### 5. WebSocket 连接断开

**原因**: Nginx 未配置会话保持或超时设置不当。

**解决方案**:
- 使用 `ip_hash` 或 `sticky` 会话保持
- 增加 WebSocket 超时时间
- 检查 Nginx 配置是否正确

---

## 监控和维护

### 健康检查

```bash
# API 健康检查
curl http://localhost:8080/api/health

# 返回示例
{
  "status": "ok",
  "database": "connected",
  "uptime": "48h30m"
}
```

### 日志查看

```bash
# 实时日志
tail -f logs/zjump.log

# 错误日志过滤
grep ERROR logs/zjump.log

# 审计日志查询
mysql -u root -p zjump -e "SELECT * FROM command_histories ORDER BY executed_at DESC LIMIT 10;"
```

### 备份策略

```bash
# 每日数据库备份
0 2 * * * mysqldump zjump > /backup/zjump_$(date +\%Y\%m\%d).sql

# 保留30天备份
0 3 * * * find /backup -name "zjump_*.sql" -mtime +30 -delete
```

---

## 性能调优

### MySQL 优化

```ini
[mysqld]
# 连接数
max_connections = 500

# InnoDB 缓冲池
innodb_buffer_pool_size = 2G

# 查询缓存
query_cache_size = 128M

# 慢查询日志
slow_query_log = 1
long_query_time = 2
```

### 系统优化

```bash
# 增加文件描述符限制
ulimit -n 65535

# TCP 连接优化
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_fin_timeout=30
```

---

## 参考

- [JumpServer 文档](https://docs.jumpserver.org/)
- [SSH Protocol RFC](https://tools.ietf.org/html/rfc4253)
- [MySQL 主从复制](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [Nginx 负载均衡](http://nginx.org/en/docs/http/load_balancing.html)

---

**最后更新**: 2025-01-17

