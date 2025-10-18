# ZJump API 文档

ZJump 后端 RESTful API 接口文档。

## 基础信息

- **Base URL**: `http://localhost:8080/api`
- **认证方式**: JWT Token (Bearer)
- **Content-Type**: `application/json`

## 认证

### 登录

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "username": "admin",
    "role": "admin",
    "email": "admin@zjump.com"
  }
}
```

### 使用 Token

在后续请求中添加 Header:
```http
Authorization: Bearer <token>
```

---

## API 端点

### 健康检查

```http
GET /api/health
```

**响应**:
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": "48h30m"
}
```

---

## 主机管理

### 获取主机列表

```http
GET /api/hosts
Authorization: Bearer <token>
```

### 创建主机

```http
POST /api/hosts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Web Server 01",
  "ip": "192.168.1.100",
  "port": 22,
  "username": "root",
  "password": "encrypted_password",
  "device_type": "linux",
  "protocol": "ssh"
}
```

### 更新主机

```http
PUT /api/hosts/:id
Authorization: Bearer <token>
```

### 删除主机

```http
DELETE /api/hosts/:id
Authorization: Bearer <token>
```

---

## 会话管理

### 获取会话列表

```http
GET /api/sessions
Authorization: Bearer <token>
```

### 获取会话录像

```http
GET /api/sessions/:id/recording
Authorization: Bearer <token>
```

---

## WebSocket 终端

### 建立 WebSocket 连接

```
ws://localhost:8080/ws/terminal?host_id=<host_id>&token=<jwt_token>
```

**消息格式**:
```json
{
  "type": "input",
  "data": "ls -la\n"
}
```

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（未登录或Token过期） |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## Swagger 文档

更详细的 API 文档请访问 Swagger UI:

```
http://localhost:8080/swagger/index.html
```

本项目已集成 Swagger，可以通过 Web 界面查看和测试所有 API 接口。

---

**注意**: 本文档持续更新中，完整的 API 接口请参考 Swagger 文档。

**最后更新**: 2025-01-17

