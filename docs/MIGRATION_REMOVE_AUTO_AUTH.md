# 移除 Auto 认证类型迁移指南

## 📋 概述

本次优化移除了系统用户的 `auto` 认证类型，强制要求明确指定 `password` 或 `key` 认证方式，提高了系统的安全性和可控性。

## 🎯 优化目标

### 移除前的问题
1. **不可控**：无法预知实际使用的认证方式
2. **安全隐患**：可能意外降级到密码认证
3. **审计困难**：难以追踪使用了哪种认证方式
4. **配置混乱**：用户可能同时配置密码和密钥但不知道会用哪个

### 优化后的优势
1. ✅ **明确认证**：必须明确选择 `password` 或 `key`
2. ✅ **严格验证**：前后端都验证认证信息完整性
3. ✅ **更安全**：只使用指定的认证方式，不会自动降级
4. ✅ **易审计**：清晰知道每个系统用户使用的认证方式

## 📦 修改内容

### 1. 后端修改

#### 模型层 (`internal/model/system_user.go`)
```go
// 修改前
AuthType string `json:"authType" gorm:"type:varchar(20);default:'password'"` // password, key, auto

// 修改后
AuthType string `json:"authType" gorm:"type:varchar(20);default:'password'"` // password, key
```

#### SSH 客户端 (`pkg/sshclient/client.go`)
- 新增 `AuthType` 和 `Passphrase` 字段
- 实现严格的认证方式选择逻辑：
  - `authType = "password"`: 只使用密码认证
  - `authType = "key"`: 只使用密钥认证
  - 不再支持同时尝试多种认证方式

#### 连接处理 (`internal/api/handler/connection_handler.go`)
- 添加认证信息完整性验证
- 传递明确的 `AuthType` 到 SSH 客户端

### 2. 前端修改

#### 类型定义 (`ui/zjump-web/src/types/index.ts`)
```typescript
// 修改前
authType: 'password' | 'key' | 'auto';

// 修改后
authType: 'password' | 'key';
```

#### 系统用户页面 (`ui/zjump-web/src/pages/SystemUsers.tsx`)
- 移除 `auto` 选项
- 添加表单验证：
  - 选择密码认证时必须填写密码
  - 选择密钥认证时必须填写 SSH 私钥
- 更新统计数据（移除 auto 计数）

#### 国际化文件
- 移除 `auto` 相关翻译
- 添加验证错误消息：
  - `requiredFields`: 请填写必填字段
  - `passwordRequired`: 选择密码认证时必须填写密码
  - `privateKeyRequired`: 选择密钥认证时必须填写SSH私钥

### 3. 数据库修改

#### 初始化脚本 (`sql/init.sql`)
```sql
-- 修改前
auth_type VARCHAR(20) DEFAULT 'password' COMMENT 'Auth type: password, key, auto',

-- 修改后
auth_type VARCHAR(20) DEFAULT 'password' COMMENT 'Auth type: password, key',
```

#### 迁移脚本 (`sql/migration_remove_auto_auth.sql`)
- 将所有 `auth_type='auto'` 的记录改为 `'password'`
- 更新表注释

## 🚀 部署步骤

### 1. 备份数据库
```bash
mysqldump -u root -p zjump > zjump_backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 执行数据库迁移
```bash
mysql -u root -p zjump < sql/migration_remove_auto_auth.sql
```

### 3. 更新后端代码
```bash
cd zjump-backend
make build
```

### 4. 更新前端代码
```bash
cd ui/zjump-web
npm install
npm run build
```

### 5. 重启服务
```bash
# 停止旧服务
systemctl stop zjump

# 启动新服务
./bin/api-server
# 或
systemctl start zjump
```

## 🔄 回滚方案

如果遇到问题需要回滚：

```bash
# 1. 执行回滚脚本
mysql -u root -p zjump < sql/migration_remove_auto_auth_rollback.sql

# 2. 回滚代码到之前的版本
git checkout <previous-commit>

# 3. 重新构建和部署
make build
systemctl restart zjump
```

## ✅ 验证清单

部署后请验证以下功能：

- [ ] 系统用户列表正常显示（无 auto 类型）
- [ ] 创建新系统用户，选择密码认证，必须填写密码
- [ ] 创建新系统用户，选择密钥认证，必须填写私钥
- [ ] 使用密码认证的系统用户可以正常连接主机
- [ ] 使用密钥认证的系统用户可以正常连接主机
- [ ] 带密码的私钥可以正常使用
- [ ] 会话录制和审计功能正常
- [ ] 命令黑名单功能正常

## 📊 影响范围

### 兼容性
- ✅ **向前兼容**：已有的 `password` 和 `key` 类型系统用户不受影响
- ⚠️ **不兼容**：现有的 `auto` 类型系统用户会被自动转为 `password` 类型

### 用户影响
- 管理员需要明确为每个系统用户选择认证方式
- 原本使用 `auto` 的系统用户会改为 `password` 认证
- 如果这些系统用户实际需要使用密钥认证，需要手动修改

## 🔍 故障排查

### 问题：连接失败，提示认证错误
**原因**：系统用户可能原本使用密钥认证，但被迁移改为了密码认证

**解决**：
1. 检查该系统用户在目标主机上的认证配置
2. 在前端编辑该系统用户，改为 `key` 认证
3. 填写正确的 SSH 私钥

### 问题：前端显示 "privateKeyRequired" 错误
**原因**：选择了密钥认证但未填写私钥

**解决**：
1. 填写 SSH 私钥内容
2. 或改为密码认证并填写密码

## 📝 注意事项

1. **生产环境部署前务必备份数据库**
2. 建议在测试环境先验证
3. 迁移脚本会自动将 `auto` 改为 `password`，如需使用密钥认证的系统用户请手动调整
4. 部署完成后检查所有系统用户的认证方式是否正确

## 📞 支持

如有问题，请联系：
- QQ 群：675310096
- GitHub Issues：提交问题反馈

---

**迁移日期**: 2025-10-18  
**版本**: v1.0

