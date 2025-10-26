-- ZJump Database Initialization Script
-- Complete schema with all required tables

-- Create database
CREATE DATABASE IF NOT EXISTS zjump CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE zjump;

-- ============================================================================
-- User Management Tables
-- ============================================================================

-- Users table (platform users)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY COMMENT 'User unique identifier',
    username VARCHAR(50) UNIQUE NOT NULL COMMENT 'Username for login',
    password VARCHAR(255) NOT NULL COMMENT 'Encrypted password',
    ssh_public_key TEXT COMMENT 'SSH public key for authentication',
    ssh_private_key_encrypted TEXT COMMENT 'Encrypted SSH private key (for user download)',
    auth_method VARCHAR(20) DEFAULT 'password' COMMENT 'Authentication method: password, publickey, both',
    ssh_key_generated_at TIMESTAMP NULL COMMENT 'When the SSH key was generated',
    ssh_key_fingerprint VARCHAR(255) COMMENT 'SSH key fingerprint (SHA256)',
    email VARCHAR(100) UNIQUE COMMENT 'Email address',
    full_name VARCHAR(100) COMMENT 'Full name',
    role VARCHAR(20) DEFAULT 'user' COMMENT 'Role: admin, user',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, inactive',
    expires_at TIMESTAMP NULL COMMENT 'Account expiration time (NULL = never expires)',
    expiration_warning_sent BOOLEAN DEFAULT FALSE COMMENT 'Whether expiration warning has been sent',
    auto_disable_on_expiry BOOLEAN DEFAULT TRUE COMMENT 'Auto disable account when expired',
    last_login_time TIMESTAMP NULL COMMENT 'Last login time',
    last_login_ip VARCHAR(45) COMMENT 'Last login IP address',
    
    -- 2FA related fields
    two_factor_enabled BOOLEAN DEFAULT FALSE COMMENT 'Whether 2FA is enabled for this user',
    two_factor_secret VARCHAR(255) COMMENT '2FA secret key (encrypted)',
    two_factor_backup_codes TEXT COMMENT '2FA backup codes (JSON array, encrypted)',
    two_factor_verified_at TIMESTAMP NULL COMMENT 'When 2FA was verified and enabled',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_role (role),
    INDEX idx_auth_method (auth_method),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Platform users with SSH key authentication support';

-- ============================================================================
-- Host Management Tables
-- ============================================================================

-- Hosts table (asset hosts)
-- Note: Authentication credentials (username, password, private_key) and protocol have been moved to system_users table
-- Hosts are now linked to system_users via permission_rules for flexible permission management
CREATE TABLE IF NOT EXISTS hosts (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Host unique identifier',
    name VARCHAR(255) NOT NULL COMMENT 'Host name',
    ip VARCHAR(45) NOT NULL COMMENT 'IP address',
    port INT DEFAULT 22 COMMENT 'SSH port',
    status VARCHAR(20) DEFAULT 'unknown' COMMENT 'Status: online, offline, unknown',
    os VARCHAR(100) COMMENT 'Operating system',
    cpu VARCHAR(100) COMMENT 'CPU info',
    memory VARCHAR(50) COMMENT 'Memory info',
    device_type VARCHAR(20) DEFAULT 'linux' COMMENT 'Device type: linux, windows, vmware, docker, switch, router, firewall, storage, other',
    connection_mode VARCHAR(20) DEFAULT 'auto' COMMENT 'Connection mode: auto, direct, proxy',
    proxy_id VARCHAR(128) COMMENT 'Specific proxy ID when connection_mode=proxy',
    network_zone VARCHAR(50) COMMENT 'Network zone for routing',
    tags TEXT COMMENT 'Tags (JSON array)',
    description TEXT COMMENT 'Description',
    last_login_time TIMESTAMP NULL COMMENT 'Last login time',
    login_count INT DEFAULT 0 COMMENT 'Total login count',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip (ip),
    INDEX idx_status (status),
    INDEX idx_device_type (device_type),
    INDEX idx_connection_mode (connection_mode),
    INDEX idx_proxy_id (proxy_id),
    INDEX idx_network_zone (network_zone),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Host assets (authentication and protocol managed via system_users)';

-- ============================================================================
-- Host Groups Tables
-- ============================================================================

-- Host groups table (user-defined groups)
CREATE TABLE IF NOT EXISTS host_groups (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Group unique identifier',
    name VARCHAR(100) NOT NULL COMMENT 'Group name',
    description TEXT COMMENT 'Group description',
    color VARCHAR(20) COMMENT 'Display color (hex code)',
    icon VARCHAR(50) COMMENT 'Display icon',
    sort_order INT DEFAULT 0 COMMENT 'Display sort order',
    created_by VARCHAR(36) COMMENT 'Creator user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_created_by (created_by),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Host groups (user-defined)';

-- Host-Group relationship table (many-to-many)
CREATE TABLE IF NOT EXISTS host_group_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL COMMENT 'Group ID',
    host_id VARCHAR(36) NOT NULL COMMENT 'Host ID',
    added_by VARCHAR(36) COMMENT 'Who added this host to group',
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES host_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE,
    UNIQUE KEY uk_group_host (group_id, host_id),
    INDEX idx_group_id (group_id),
    INDEX idx_host_id (host_id),
    INDEX idx_group_host_idx (group_id, host_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Host-Group relationship (many-to-many)';

-- ==================================================================================
-- DEPRECATED: 以下两个表已废弃，新权限架构使用：
-- User → UserGroup → PermissionRule → (SystemUser + HostGroup)
-- 保留这些表是为了向后兼容，但建议在新系统中不再使用
-- ==================================================================================

-- User-Group permissions table (DEPRECATED - 使用新的 user_groups + permission_rules)
CREATE TABLE IF NOT EXISTS user_group_permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    group_id VARCHAR(36) NOT NULL COMMENT 'Host group ID',
    created_by VARCHAR(36) COMMENT 'Admin who assigned this permission',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_group (user_id, group_id),
    INDEX idx_user_id (user_id),
    INDEX idx_group_id (group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES host_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='[DEPRECATED] User-HostGroup permission mapping - Use user_groups + permission_rules instead';

-- User-Host permissions table (DEPRECATED - 使用新的 user_groups + permission_rules)
CREATE TABLE IF NOT EXISTS user_host_permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    host_id VARCHAR(36) NOT NULL COMMENT 'Host ID',
    created_by VARCHAR(36) COMMENT 'Admin who assigned this permission',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_host (user_id, host_id),
    INDEX idx_user_id (user_id),
    INDEX idx_host_id (host_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User-Host permission mapping for individual host access';

-- ============================================================================
-- Session & Connection Tables
-- ============================================================================

-- VM Login records table (只记录虚拟机登录记录，不包括平台登录)
CREATE TABLE IF NOT EXISTS login_records (
    id VARCHAR(100) PRIMARY KEY COMMENT 'Login record identifier (same as session_id)',
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID (platform user who logged into VM)',
    host_id VARCHAR(36) NOT NULL COMMENT 'Host ID (虚拟机ID，必填)',
    host_name VARCHAR(255) COMMENT 'Host name',
    host_ip VARCHAR(45) COMMENT 'Host IP',
    username VARCHAR(100) COMMENT 'Username (VM login username)',
    login_ip VARCHAR(45) COMMENT 'Login source IP',
    user_agent VARCHAR(255) COMMENT 'User agent',
    login_time TIMESTAMP NOT NULL COMMENT 'Login time',
    logout_time TIMESTAMP NULL COMMENT 'Logout time',
    duration INT COMMENT 'Session duration (seconds)',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, completed, failed',
    session_id VARCHAR(100) COMMENT 'Session ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_host_id (host_id),
    INDEX idx_login_time (login_time),
    INDEX idx_status (status),
    INDEX idx_user_host (user_id, host_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='VM login records only (not for platform login)';

-- Platform Login records table (只记录用户登录平台的记录，不包括虚拟机登录)
CREATE TABLE IF NOT EXISTS platform_login_records (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Login record ID',
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    username VARCHAR(50) NOT NULL COMMENT 'Username',
    login_ip VARCHAR(45) COMMENT 'Login source IP',
    user_agent VARCHAR(255) COMMENT 'User agent (browser info)',
    login_time TIMESTAMP NOT NULL COMMENT 'Login time',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, logged_out',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_login_time (login_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Platform login records (user login to ZJump platform)';

-- ============================================================================
-- Audit Tables
-- ============================================================================

-- Session history table (complete audit trail)
CREATE TABLE IF NOT EXISTS session_histories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    proxy_id VARCHAR(100) NOT NULL COMMENT 'Proxy agent ID or "api-server" for direct',
    session_id VARCHAR(100) UNIQUE NOT NULL COMMENT 'Unique session identifier',
    host_id VARCHAR(36) COMMENT 'Target host ID',
    user_id VARCHAR(100) COMMENT 'User ID',
    username VARCHAR(100) COMMENT 'Username',
    host_ip VARCHAR(45) COMMENT 'Target host IP',
    start_time TIMESTAMP NOT NULL COMMENT 'Session start time',
    end_time TIMESTAMP NULL COMMENT 'Session end time (NULL if active)',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, closed',
    recording LONGTEXT COMMENT 'Session recording (Asciinema format)',
    terminal_cols INT DEFAULT 120 COMMENT 'Terminal columns',
    terminal_rows INT DEFAULT 30 COMMENT 'Terminal rows',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proxy_id (proxy_id),
    INDEX idx_session_id (session_id),
    INDEX idx_host_id (host_id),
    INDEX idx_user_id (user_id),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Session history with recordings';

-- Command history table (command audit trail)
CREATE TABLE IF NOT EXISTS command_histories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    proxy_id VARCHAR(100) NOT NULL COMMENT 'Proxy agent ID or "api-server"',
    session_id VARCHAR(100) NOT NULL COMMENT 'Session ID',
    host_id VARCHAR(36) COMMENT 'Target host ID',
    user_id VARCHAR(100) COMMENT 'User ID',
    username VARCHAR(100) COMMENT 'Username',
    host_ip VARCHAR(45) COMMENT 'Target host IP',
    command TEXT NOT NULL COMMENT 'Executed command',
    output TEXT COMMENT 'Command output',
    exit_code INT COMMENT 'Exit code',
    executed_at TIMESTAMP NOT NULL COMMENT 'Execution time',
    duration_ms BIGINT COMMENT 'Duration (milliseconds)',
    is_dangerous BOOLEAN DEFAULT FALSE COMMENT 'Matched blacklist',
    blocked BOOLEAN DEFAULT FALSE COMMENT 'Was blocked',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proxy_id (proxy_id),
    INDEX idx_session_id (session_id),
    INDEX idx_host_id (host_id),
    INDEX idx_user_id (user_id),
    INDEX idx_executed_at (executed_at),
    INDEX idx_is_dangerous (is_dangerous),
    INDEX idx_blocked (blocked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Command execution history';

-- Session recordings table (unified recordings from webshell and direct SSH)
CREATE TABLE IF NOT EXISTS session_recordings (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Unique recording identifier (UUID)',
    session_id VARCHAR(100) UNIQUE NOT NULL COMMENT 'Session identifier',
    connection_type VARCHAR(20) DEFAULT 'webshell' COMMENT 'Connection type: webshell, ssh_gateway, ssh_client',
    proxy_id VARCHAR(100) COMMENT 'Proxy agent ID or "api-server-direct"',
    user_id VARCHAR(36) COMMENT 'User ID',
    host_id VARCHAR(36) NOT NULL COMMENT 'Target host ID',
    host_name VARCHAR(255) COMMENT 'Host name',
    host_ip VARCHAR(45) COMMENT 'Host IP address',
    username VARCHAR(100) COMMENT 'Username',
    start_time TIMESTAMP NOT NULL COMMENT 'Session start time',
    end_time TIMESTAMP NULL COMMENT 'Session end time (NULL if active)',
    duration VARCHAR(50) COMMENT 'Session duration (formatted string)',
    command_count INT DEFAULT 0 COMMENT 'Number of commands executed',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Session status: active, closed',
    recording LONGTEXT COMMENT 'Session recording data (Asciinema format)',
    terminal_cols INT DEFAULT 80 COMMENT 'Terminal columns',
    terminal_rows INT DEFAULT 24 COMMENT 'Terminal rows',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_connection_type (connection_type),
    INDEX idx_proxy_id (proxy_id),
    INDEX idx_user_id (user_id),
    INDEX idx_host_id (host_id),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Unified session recordings from webshell and direct SSH connections';

-- ============================================================================
-- SSH Host Key Management Tables
-- ============================================================================

-- SSH Host Keys table (shared host key for multi-instance deployment)
CREATE TABLE IF NOT EXISTS ssh_host_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_type VARCHAR(20) DEFAULT 'rsa' COMMENT 'Key type: rsa, ecdsa, ed25519',
    key_name VARCHAR(50) DEFAULT 'default' COMMENT 'Key name for different purposes',
    private_key TEXT NOT NULL COMMENT 'SSH private key (PEM format)',
    public_key TEXT NOT NULL COMMENT 'SSH public key',
    fingerprint VARCHAR(255) NOT NULL COMMENT 'SSH key fingerprint (SHA256)',
    key_size INT DEFAULT 2048 COMMENT 'Key size in bits',
    comment TEXT COMMENT 'Description or comment',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_key_type_name (key_type, key_name),
    INDEX idx_key_name (key_name),
    INDEX idx_fingerprint (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='SSH host keys shared across all instances for consistent client experience';

-- Note: SSH host keys will be automatically generated on first startup
-- The system will check for existence of default RSA key and generate if not found

-- ============================================================================
-- Proxy Management Tables
-- ============================================================================

-- Proxies table (proxy agent status and registration - unified table)
CREATE TABLE IF NOT EXISTS proxies (
    id VARCHAR(36) PRIMARY KEY,
    proxy_id VARCHAR(100) UNIQUE NOT NULL COMMENT 'Proxy unique ID',
    host_name VARCHAR(255) COMMENT 'Proxy host name',
    ip VARCHAR(45) COMMENT 'Proxy IP address',
    port INT COMMENT 'Proxy port',
    type VARCHAR(32) COMMENT 'Proxy type: ssh, rdp',
    status VARCHAR(20) DEFAULT 'offline' COMMENT 'Status: online, offline',
    version VARCHAR(50) COMMENT 'Proxy version',
    network_zone VARCHAR(50) COMMENT 'Network zone',
    start_time TIMESTAMP NULL COMMENT 'Proxy start time',
    last_heartbeat TIMESTAMP NULL COMMENT 'Last heartbeat time',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_proxy_id (proxy_id),
    INDEX idx_status (status),
    INDEX idx_network_zone (network_zone),
    INDEX idx_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Proxy agents status and registration (unified)';

-- ============================================================================
-- Security Tables
-- ============================================================================

-- Blacklist rules table (dangerous command blocking)
CREATE TABLE IF NOT EXISTS blacklist_rules (
    id VARCHAR(64) PRIMARY KEY COMMENT 'Rule unique ID',
    command VARCHAR(255) NOT NULL COMMENT 'Command name',
    pattern VARCHAR(512) NOT NULL COMMENT 'Match pattern (regex supported)',
    description TEXT COMMENT 'Rule description',
    scope VARCHAR(20) DEFAULT 'global' COMMENT 'Scope: global, user',
    users JSON COMMENT 'Restricted users (JSON array)',
    enabled BOOLEAN DEFAULT TRUE COMMENT 'Is enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_command (command),
    INDEX idx_enabled (enabled),
    INDEX idx_scope (scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Command blacklist rules';

-- ============================================================================
-- System Configuration Tables
-- ============================================================================

-- Settings table (system configuration)
CREATE TABLE IF NOT EXISTS settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(100) UNIQUE NOT NULL COMMENT 'Setting key',
    value TEXT COMMENT 'Setting value',
    category VARCHAR(50) COMMENT 'Category: system, ldap, sso, security, audit, notification, terminal, upload',
    type VARCHAR(20) COMMENT 'Type: string, number, boolean, json',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (`key`),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System settings';

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Admin user will be inserted later with a specific UUID for consistency

-- Insert sample hosts (authentication and protocol managed via system_users)
INSERT INTO hosts (id, name, ip, port, status, os, cpu, memory, device_type, connection_mode, network_zone, tags, description, login_count)
VALUES
    ('1', 'Web Server 01', '192.168.1.101', 22, 'online', 'Ubuntu 22.04 LTS', 'Intel Xeon 8-core', '32GB', 'linux', 'auto', 'production', '["production","web"]', 'Main web application server', 156),
    ('2', 'Database Server', '192.168.1.102', 22, 'online', 'CentOS 7.9', 'AMD EPYC 16-core', '64GB', 'linux', 'auto', 'production', '["production","database"]', 'MySQL primary database', 89),
    ('3', 'Test Server 01', '127.0.0.1', 2222, 'online', 'Ubuntu 24.04 LTS', 'Intel Core i7 4-core', '16GB', 'linux', 'auto', 'testing', '["testing","application"]', 'Local test server for development', 0),
    ('4', 'Redis Cache', '192.168.1.103', 22, 'online', 'Debian 11', 'Intel Xeon 4-core', '16GB', 'linux', 'auto', 'production', '["production","cache"]', 'Redis cache cluster node', 45),
    ('5', 'Dev Server 01', '192.168.3.101', 22, 'offline', 'Ubuntu 22.04 LTS', 'Intel Core i5 4-core', '8GB', 'linux', 'auto', 'development', '["development"]', 'Development test machine', 412),
    ('6', 'Core Switch', '192.168.1.1', 22, 'online', 'Cisco IOS', 'Cisco Catalyst', 'N/A', 'switch', 'auto', 'network', '["network","core"]', 'Core network switch', 23),
    ('7', 'Firewall', '192.168.1.254', 22, 'online', 'pfSense', 'Intel Atom', '4GB', 'firewall', 'auto', 'security', '["security","firewall"]', 'Network firewall', 67),
    ('8', 'Storage Server', '192.168.1.200', 22, 'online', 'FreeNAS', 'Intel Xeon 4-core', '16GB', 'storage', 'auto', 'storage', '["storage","nas"]', 'Network attached storage', 12)
ON DUPLICATE KEY UPDATE name=name;

-- Insert default host groups
INSERT INTO host_groups (id, name, description, color, icon, sort_order, created_by) VALUES
    ('default-group', 'Default', 'Default host group', '#1890ff', '', 0, NULL)
ON DUPLICATE KEY UPDATE name=name;

-- Map all hosts to default group
INSERT INTO host_group_members (group_id, host_id, added_by)
SELECT 'default-group', id, NULL FROM hosts
ON DUPLICATE KEY UPDATE group_id=group_id;

-- Insert default blacklist rules
INSERT INTO blacklist_rules (id, command, pattern, description, scope, enabled)
VALUES
    (UUID(), 'rm', '^rm\\s+.*(-rf?|--recursive).*', 'Block dangerous file deletion', 'global', TRUE),
    (UUID(), 'dd', '^dd\\s+.*of=/dev/', 'Block disk overwrite', 'global', TRUE),
    (UUID(), 'mkfs', '^mkfs\\.', 'Block filesystem formatting', 'global', TRUE),
    (UUID(), 'reboot', '^(reboot|shutdown|halt|poweroff)', 'Block system restart', 'global', TRUE),
    (UUID(), 'fdisk', '^fdisk\\s+/dev/', 'Block disk partitioning', 'global', TRUE)
ON DUPLICATE KEY UPDATE command=command;

-- Insert default system settings
INSERT INTO settings (`key`, value, category, type)
VALUES
    ('system.title', 'ZJump Bastion Host', 'system', 'string'),
    ('system.session_timeout', '3600', 'system', 'number'),
    ('security.max_login_attempts', '5', 'security', 'number'),
    ('security.lockout_duration', '1800', 'security', 'number'),
    ('audit.enable_command_recording', 'true', 'audit', 'boolean'),
    ('audit.enable_session_recording', 'true', 'audit', 'boolean'),
    ('terminal.default_cols', '120', 'terminal', 'number'),
    ('terminal.default_rows', '30', 'terminal', 'number')
ON DUPLICATE KEY UPDATE `key`=`key`;

-- ============================================================================
-- Approval Management Tables (工单审批系统)
-- ============================================================================

-- Approvals table (审批工单)
CREATE TABLE IF NOT EXISTS approvals (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Approval unique identifier',
    title VARCHAR(255) NOT NULL COMMENT 'Approval title',
    description TEXT COMMENT 'Approval description',
    type VARCHAR(50) NOT NULL COMMENT 'Approval type: host_access, host_group_access',
    status VARCHAR(50) DEFAULT 'pending' COMMENT 'Status: pending, approved, rejected, canceled, expired',
    platform VARCHAR(50) DEFAULT 'internal' COMMENT 'Approval platform: internal, feishu, dingtalk, wechat, custom',
    
    -- Applicant information
    applicant_id VARCHAR(36) NOT NULL COMMENT 'Applicant user ID',
    applicant_name VARCHAR(100) COMMENT 'Applicant name',
    applicant_email VARCHAR(100) COMMENT 'Applicant email',
    
    -- Approver information
    approver_ids TEXT COMMENT 'Approver IDs (JSON array)',
    approver_names TEXT COMMENT 'Approver names (JSON array)',
    current_approver VARCHAR(100) COMMENT 'Current approver name',
    
    -- Resource information
    resource_type VARCHAR(50) COMMENT 'Resource type: host, host_group',
    resource_ids TEXT COMMENT 'Resource IDs (JSON array)',
    resource_names TEXT COMMENT 'Resource names (JSON array)',
    
    -- Permission information
    permissions TEXT COMMENT 'Permissions (JSON array)',
    duration INT COMMENT 'Permission duration in hours',
    expires_at TIMESTAMP NULL COMMENT 'Permission expiration time',
    
    -- Approval details
    reason TEXT COMMENT 'Application reason',
    approval_note TEXT COMMENT 'Approval note',
    reject_reason TEXT COMMENT 'Reject reason',
    
    -- External platform information
    external_id VARCHAR(255) COMMENT 'External platform approval ID',
    external_url TEXT COMMENT 'External platform approval URL',
    external_data TEXT COMMENT 'External platform data (JSON)',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL COMMENT 'Approved time',
    rejected_at TIMESTAMP NULL COMMENT 'Rejected time',
    
    INDEX idx_applicant_id (applicant_id),
    INDEX idx_status (status),
    INDEX idx_type (type),
    INDEX idx_platform (platform),
    INDEX idx_created_at (created_at),
    INDEX idx_external_id (external_id),
    FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Approval requests';

-- Approval comments table (审批评论/历史记录)
CREATE TABLE IF NOT EXISTS approval_comments (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Comment unique identifier',
    approval_id VARCHAR(36) NOT NULL COMMENT 'Approval ID',
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    user_name VARCHAR(100) COMMENT 'User name',
    action VARCHAR(50) COMMENT 'Action: submit, approve, reject, comment, cancel',
    comment TEXT COMMENT 'Comment content',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_approval_id (approval_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Approval comments and history';

-- 文件传输审计表
CREATE TABLE IF NOT EXISTS file_transfers (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    username VARCHAR(100),
    host_id VARCHAR(36) NOT NULL,
    host_ip VARCHAR(50),
    host_name VARCHAR(200),
    direction VARCHAR(20) NOT NULL,  -- upload, download
    local_path VARCHAR(500),
    remote_path VARCHAR(500),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'uploading',  -- uploading, completed, failed
    progress INT DEFAULT 0,
    error_message TEXT,
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    duration INT DEFAULT 0,  -- 传输耗时（秒）
    INDEX idx_file_transfers_session (session_id),
    INDEX idx_file_transfers_user (user_id),
    INDEX idx_file_transfers_host (host_id),
    INDEX idx_file_transfers_filename (file_name),
    INDEX idx_file_transfers_time (transferred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='File transfer audit records';

-- 资产同步配置表
CREATE TABLE IF NOT EXISTS asset_sync_configs (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,  -- prometheus, zabbix, cmdb, custom
    enabled BOOLEAN DEFAULT true,
    url VARCHAR(500) NOT NULL,
    auth_type VARCHAR(20),  -- none, basic, token, oauth
    username VARCHAR(100),
    password VARCHAR(200),
    token TEXT,
    sync_interval INT DEFAULT 60,  -- 同步间隔（分钟）
    last_sync_time TIMESTAMP NULL,
    last_sync_status VARCHAR(20),  -- success, failed
    synced_count INT DEFAULT 0,
    error_message TEXT,
    config TEXT,  -- JSON配置
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_asset_sync_enabled (enabled),
    INDEX idx_asset_sync_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Asset sync configurations';

-- 资产同步日志表
CREATE TABLE IF NOT EXISTS asset_sync_logs (
    id VARCHAR(36) PRIMARY KEY,
    config_id VARCHAR(36) NOT NULL,
    status VARCHAR(20),  -- success, failed
    synced_count INT DEFAULT 0,
    error_message TEXT,
    duration INT DEFAULT 0,  -- 耗时（秒）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_sync_logs_config (config_id),
    INDEX idx_asset_sync_logs_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Asset sync logs';

-- ============================================================================
-- Approval Platform Configuration Tables
-- ============================================================================

-- 工单平台配置表
CREATE TABLE IF NOT EXISTS approval_configs (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Configuration unique identifier',
    name VARCHAR(100) NOT NULL COMMENT 'Configuration name',
    type VARCHAR(20) NOT NULL COMMENT 'Platform type: feishu, dingtalk, wechat',
    enabled BOOLEAN DEFAULT false COMMENT 'Enable status, only one can be enabled per type',
    
    -- 应用凭证
    app_id VARCHAR(100) NOT NULL COMMENT 'Application ID or AppKey',
    app_secret VARCHAR(200) NOT NULL COMMENT 'Application Secret',
    
    -- 平台特定字段
    approval_code VARCHAR(100) COMMENT 'Feishu approval definition code',
    process_code VARCHAR(100) COMMENT 'DingTalk process code',
    template_id VARCHAR(100) COMMENT 'WeChat Work template ID',
    
    -- 表单字段映射
    form_fields TEXT COMMENT 'Form field mapping JSON',
    
    -- 审批人配置
    approver_user_ids TEXT COMMENT '审批人用户ID列表(JSON)',
    
    -- API配置
    api_base_url VARCHAR(500) DEFAULT '' COMMENT 'API基础URL，用户自定义填写',
    api_path VARCHAR(200) DEFAULT '' COMMENT 'API调用路径（创建审批）',
    api_path_get VARCHAR(200) DEFAULT '' COMMENT '获取审批API路径',
    api_path_cancel VARCHAR(200) DEFAULT '' COMMENT '取消审批API路径',
    
    -- 回调配置
    callback_url VARCHAR(500) DEFAULT '' COMMENT '回调URL',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
    
    INDEX idx_approval_config_type (type),
    INDEX idx_approval_config_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Third-party approval platform configurations';

-- ============================================================================
-- System Users and User Groups Tables (多系统用户权限管理)
-- ============================================================================

-- 系统用户表（目标主机上的操作系统用户）
CREATE TABLE IF NOT EXISTS system_users (
    id VARCHAR(36) PRIMARY KEY COMMENT 'System user unique identifier',
    name VARCHAR(100) NOT NULL COMMENT 'System user name (display name)',
    username VARCHAR(100) NOT NULL COMMENT 'OS username (e.g., root, admin, dev)',
    
    -- 认证信息 (明确认证方式，不支持 auto)
    auth_type VARCHAR(20) DEFAULT 'password' COMMENT 'Auth type: password, key',
    password TEXT COMMENT 'Encrypted password',
    private_key TEXT COMMENT 'SSH private key',
    passphrase TEXT COMMENT 'Private key passphrase',
    
    -- 协议和设置
    protocol VARCHAR(20) DEFAULT 'ssh' COMMENT 'Protocol: ssh, rdp',
    
    -- 其他设置
    priority INT DEFAULT 0 COMMENT 'Priority (higher = preferred)',
    description TEXT COMMENT 'Description',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, inactive',
    
    created_by VARCHAR(36) COMMENT 'Creator user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_status (status),
    INDEX idx_protocol (protocol),
    INDEX idx_priority (priority),
    INDEX idx_status_priority (status, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System users (OS users on target hosts)';

-- 用户组表（平台用户组，用于批量权限管理）
CREATE TABLE IF NOT EXISTS user_groups (
    id VARCHAR(36) PRIMARY KEY COMMENT 'User group unique identifier',
    name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Group name',
    description TEXT COMMENT 'Group description',
    
    -- 显示相关
    color VARCHAR(20) COMMENT 'Display color (hex code)',
    icon VARCHAR(50) COMMENT 'Display icon',
    priority INT DEFAULT 0 COMMENT 'Priority',
    
    status VARCHAR(20) DEFAULT 'active' COMMENT 'Status: active, inactive',
    created_by VARCHAR(36) COMMENT 'Creator user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User groups for permission management';

-- 用户组成员表（用户加入用户组）
CREATE TABLE IF NOT EXISTS user_group_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_group_id VARCHAR(36) NOT NULL COMMENT 'User group ID',
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    added_by VARCHAR(36) COMMENT 'Who added this user',
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_group_user (user_group_id, user_id),
    INDEX idx_user_group_id (user_group_id),
    INDEX idx_user_id (user_id),
    INDEX idx_user_group (user_id, user_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User group membership';

-- 授权规则表（用户组 + 系统用户 + 主机组 = 权限）
CREATE TABLE IF NOT EXISTS permission_rules (
    id VARCHAR(36) PRIMARY KEY COMMENT 'Permission rule unique identifier',
    name VARCHAR(200) NOT NULL COMMENT 'Rule name',
    
    -- 授权对象
    user_group_id VARCHAR(36) NOT NULL COMMENT 'User group ID',
    
    -- 资产范围
    host_group_id VARCHAR(36) COMMENT 'Host group ID (NULL = all hosts)',
    host_ids TEXT COMMENT 'Specific host IDs (JSON array, optional)',
    
    -- 系统用户
    system_user_id VARCHAR(36) COMMENT 'System user ID (nullable, using many-to-many table)',
    
    -- 时间限制
    valid_from TIMESTAMP NULL COMMENT 'Valid from (NULL = no start limit)',
    valid_to TIMESTAMP NULL COMMENT 'Valid to (NULL = no end limit)',
    
    -- 状态
    enabled BOOLEAN DEFAULT true COMMENT 'Is enabled',
    priority INT DEFAULT 0 COMMENT 'Priority (higher = preferred)',
    
    description TEXT COMMENT 'Description',
    created_by VARCHAR(36) COMMENT 'Creator user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (host_group_id) REFERENCES host_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (system_user_id) REFERENCES system_users(id) ON DELETE CASCADE,
    
    INDEX idx_user_group_id (user_group_id),
    INDEX idx_host_group_id (host_group_id),
    INDEX idx_system_user_id (system_user_id),
    INDEX idx_enabled (enabled),
    INDEX idx_valid_from (valid_from),
    INDEX idx_valid_to (valid_to),
    INDEX idx_user_group_enabled (user_group_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permission rules (UserGroup + SystemUser + HostGroup)';

-- Permission rule to system user mapping (many-to-many)
CREATE TABLE IF NOT EXISTS permission_rule_system_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    permission_rule_id VARCHAR(36) NOT NULL COMMENT 'Permission rule ID',
    system_user_id VARCHAR(36) NOT NULL COMMENT 'System user ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_rule_system_user (permission_rule_id, system_user_id),
    INDEX idx_permission_rule_id (permission_rule_id),
    INDEX idx_system_user_id (system_user_id),
    INDEX idx_rule_user (permission_rule_id, system_user_id),
    
    FOREIGN KEY (permission_rule_id) REFERENCES permission_rules(id) ON DELETE CASCADE,
    FOREIGN KEY (system_user_id) REFERENCES system_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permission rule to system user mapping (many-to-many)';

-- Permission rule to host group mapping (many-to-many)
CREATE TABLE IF NOT EXISTS permission_rule_host_groups (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    permission_rule_id VARCHAR(36) NOT NULL COMMENT 'Permission rule ID',
    host_group_id VARCHAR(36) NOT NULL COMMENT 'Host group ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_rule_host_group (permission_rule_id, host_group_id),
    INDEX idx_permission_rule_id (permission_rule_id),
    INDEX idx_host_group_id (host_group_id),
    INDEX idx_rule_group (permission_rule_id, host_group_id),
    
    FOREIGN KEY (permission_rule_id) REFERENCES permission_rules(id) ON DELETE CASCADE,
    FOREIGN KEY (host_group_id) REFERENCES host_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permission rule to host group mapping (many-to-many)';

COMMIT;

-- =====================================================
-- Initialize Default Admin User
-- =====================================================

-- Insert default admin user (password: admin123, should be changed after first login)
-- Password hash is bcrypt hash of 'admin123'
INSERT IGNORE INTO users (id, username, password, full_name, email, role, status, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 
     'admin', 
     '$2a$10$j/lQBaOvW9dMo/O13g65qeCwYnxuaZerNcB/eA3IZZXxRp4MbePhG',
     'System Admin',
     'admin@zjump.local',
     'admin',
     'active',
     NOW(),
     NOW());

-- =====================================================
-- Initialize System Settings
-- =====================================================

-- Host Monitor Settings
INSERT IGNORE INTO settings (`key`, `value`, `category`, `type`, `created_at`, `updated_at`) VALUES
('host_monitor_enabled', 'false', 'host_monitor', 'boolean', NOW(), NOW()),
('host_monitor_interval', '5', 'host_monitor', 'number', NOW(), NOW()),
('host_monitor_method', 'tcp', 'host_monitor', 'string', NOW(), NOW()),
('host_monitor_timeout', '3', 'host_monitor', 'number', NOW(), NOW()),
('host_monitor_concurrent', '20', 'host_monitor', 'number', NOW(), NOW());

-- =====================================================
-- Initialize System Users and User Groups
-- =====================================================

-- 插入默认用户组
INSERT IGNORE INTO user_groups (id, name, description, color, status)
VALUES
    (UUID(), 'Administrators', 'Administrator user group', '#f5222d', 'active'),
    (UUID(), 'Developers', 'Developer user group', '#52c41a', 'active');

-- 将admin用户加入Administrators组
INSERT IGNORE INTO user_group_members (user_group_id, user_id, added_by)
SELECT (SELECT id FROM user_groups WHERE name = 'Administrators' LIMIT 1),
       u.id,
       NULL
FROM users u
WHERE u.username = 'admin';

-- =====================================================
-- Expiration Management Tables
-- =====================================================

-- User expiration logs
CREATE TABLE IF NOT EXISTS user_expiration_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL COMMENT 'User ID',
    username VARCHAR(50) NOT NULL COMMENT 'Username',
    action VARCHAR(50) NOT NULL COMMENT 'Action: warning_sent, expired, disabled, renewed',
    expires_at TIMESTAMP NULL COMMENT 'Expiration time at the time of action',
    new_expires_at TIMESTAMP NULL COMMENT 'New expiration time (for renewals)',
    reason TEXT COMMENT 'Reason or notes',
    performed_by VARCHAR(36) COMMENT 'Admin user ID who performed the action',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_username (username),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User expiration history logs';

-- Permission expiration logs
CREATE TABLE IF NOT EXISTS permission_expiration_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rule_id VARCHAR(36) NOT NULL COMMENT 'Permission rule ID',
    rule_name VARCHAR(200) NOT NULL COMMENT 'Rule name',
    user_group_id VARCHAR(36) NOT NULL COMMENT 'User group ID',
    user_group_name VARCHAR(100) COMMENT 'User group name',
    action VARCHAR(50) NOT NULL COMMENT 'Action: warning_sent, expired, disabled, renewed',
    valid_to TIMESTAMP NULL COMMENT 'Expiration time at the time of action',
    new_valid_to TIMESTAMP NULL COMMENT 'New expiration time (for renewals)',
    reason TEXT COMMENT 'Reason or notes',
    performed_by VARCHAR(36) COMMENT 'Admin user ID who performed the action',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_rule_id (rule_id),
    INDEX idx_user_group_id (user_group_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permission rule expiration history logs';

-- Expiration notification config
CREATE TABLE IF NOT EXISTS expiration_notification_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL COMMENT 'Type: user, permission',
    warning_days INT NOT NULL DEFAULT 7 COMMENT 'Days before expiration to send warning',
    enabled BOOLEAN DEFAULT TRUE COMMENT 'Enable notification',
    notification_channels TEXT COMMENT 'Notification channels (JSON array): email, system, feishu, dingtalk',
    message_template TEXT COMMENT 'Custom message template',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Expiration notification configuration';

-- Insert default notification configs
INSERT IGNORE INTO expiration_notification_config (type, warning_days, enabled, notification_channels)
VALUES
    ('user', 7, TRUE, '["system", "email"]'),
    ('permission', 3, TRUE, '["system", "email"]');

-- Expiration system settings
INSERT IGNORE INTO settings (`key`, `value`, `category`, `type`, `created_at`, `updated_at`) VALUES
('expiration_check_enabled', 'true', 'expiration', 'boolean', NOW(), NOW()),
('expiration_check_interval', '3600', 'expiration', 'number', NOW(), NOW()),
('user_expiration_auto_disable', 'true', 'expiration', 'boolean', NOW(), NOW()),
('permission_expiration_auto_disable', 'true', 'expiration', 'boolean', NOW(), NOW()),
('expiration_warning_days_user', '7', 'expiration', 'number', NOW(), NOW()),
('expiration_warning_days_permission', '3', 'expiration', 'number', NOW(), NOW());

-- ============================================================================
-- Two-Factor Authentication Tables
-- ============================================================================

-- 2FA global configuration table
CREATE TABLE IF NOT EXISTS two_factor_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE COMMENT 'Whether global 2FA is enabled',
    issuer VARCHAR(100) DEFAULT 'ZJump' COMMENT '2FA issuer name',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Global 2FA configuration';

-- Insert default 2FA configuration
INSERT INTO two_factor_config (enabled, issuer) VALUES (FALSE, 'ZJump')
ON DUPLICATE KEY UPDATE issuer = 'ZJump';

-- Add indexes for 2FA fields in users table
ALTER TABLE users ADD INDEX idx_two_factor_enabled (two_factor_enabled);

-- Show created tables
SELECT 
    TABLE_NAME, 
    TABLE_ROWS,
    ROUND(DATA_LENGTH / 1024 / 1024, 2) AS 'Size_MB',
    TABLE_COMMENT
FROM 
    information_schema.TABLES 
WHERE 
    TABLE_SCHEMA = 'zjump'
ORDER BY 
    TABLE_NAME;

SELECT 'Database initialized successfully!' AS Status;
