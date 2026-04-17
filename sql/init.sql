/*
 Navicat Premium Dump SQL

 Source Server         : 47.109.187.158 zjump
 Source Server Type    : MySQL
 Source Server Version : 80405 (8.4.5)
 Source Host           : 47.109.187.158:3306
 Source Schema         : zjump

 Target Server Type    : MySQL
 Target Server Version : 80405 (8.4.5)
 File Encoding         : 65001

 Date: 17/04/2026 14:21:51
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for approval_comments
-- ----------------------------
DROP TABLE IF EXISTS `approval_comments`;
CREATE TABLE `approval_comments`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Comment unique identifier',
  `approval_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Approval ID',
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID',
  `user_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User name',
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Action: submit, approve, reject, comment, cancel',
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Comment content',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_approval_id`(`approval_id` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  CONSTRAINT `approval_comments_ibfk_1` FOREIGN KEY (`approval_id`) REFERENCES `approvals` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Approval comments and history' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of approval_comments
-- ----------------------------

-- ----------------------------
-- Table structure for approval_configs
-- ----------------------------
DROP TABLE IF EXISTS `approval_configs`;
CREATE TABLE `approval_configs`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Configuration unique identifier',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Configuration name',
  `type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Platform type: feishu, dingtalk, wechat',
  `enabled` tinyint(1) NULL DEFAULT 0 COMMENT 'Enable status, only one can be enabled per type',
  `app_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Application ID or AppKey',
  `app_secret` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Application Secret',
  `approval_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Feishu approval definition code',
  `process_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'DingTalk process code',
  `template_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'WeChat Work template ID',
  `form_fields` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Form field mapping JSON',
  `approver_user_ids` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '审批人用户ID列表(JSON)',
  `api_base_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '' COMMENT 'API基础URL，用户自定义填写',
  `api_path` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '' COMMENT 'API调用路径（创建审批）',
  `api_path_get` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '' COMMENT '获取审批API路径',
  `api_path_cancel` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '' COMMENT '取消审批API路径',
  `callback_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '' COMMENT '回调URL',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_approval_config_type`(`type` ASC) USING BTREE,
  INDEX `idx_approval_config_enabled`(`enabled` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Third-party approval platform configurations' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of approval_configs
-- ----------------------------

-- ----------------------------
-- Table structure for approvals
-- ----------------------------
DROP TABLE IF EXISTS `approvals`;
CREATE TABLE `approvals`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Approval unique identifier',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Approval title',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Approval description',
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Approval type: host_access, host_group_access',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'pending' COMMENT 'Status: pending, approved, rejected, canceled, expired',
  `platform` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'internal' COMMENT 'Approval platform: internal, feishu, dingtalk, wechat, custom',
  `applicant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Applicant user ID',
  `applicant_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Applicant name',
  `applicant_email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Applicant email',
  `approver_ids` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Approver IDs (JSON array)',
  `approver_names` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Approver names (JSON array)',
  `current_approver` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Current approver name',
  `resource_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Resource type: host, host_group',
  `resource_ids` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Resource IDs (JSON array)',
  `resource_names` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Resource names (JSON array)',
  `permissions` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Permissions (JSON array)',
  `duration` int NULL DEFAULT NULL COMMENT 'Permission duration in hours',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'Permission expiration time',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Application reason',
  `approval_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Approval note',
  `reject_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Reject reason',
  `external_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'External platform approval ID',
  `external_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'External platform approval URL',
  `external_data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'External platform data (JSON)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_at` timestamp NULL DEFAULT NULL COMMENT 'Approved time',
  `rejected_at` timestamp NULL DEFAULT NULL COMMENT 'Rejected time',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_applicant_id`(`applicant_id` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_type`(`type` ASC) USING BTREE,
  INDEX `idx_platform`(`platform` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_external_id`(`external_id` ASC) USING BTREE,
  CONSTRAINT `approvals_ibfk_1` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Approval requests' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of approvals
-- ----------------------------

-- ----------------------------
-- Table structure for asset_sync_configs
-- ----------------------------
DROP TABLE IF EXISTS `asset_sync_configs`;
CREATE TABLE `asset_sync_configs`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NULL DEFAULT 1,
  `url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `password` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `token` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `sync_interval` int NULL DEFAULT 60,
  `last_sync_time` timestamp NULL DEFAULT NULL,
  `last_sync_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `synced_count` int NULL DEFAULT 0,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `config` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_asset_sync_enabled`(`enabled` ASC) USING BTREE,
  INDEX `idx_asset_sync_type`(`type` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Asset sync configurations' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of asset_sync_configs
-- ----------------------------

-- ----------------------------
-- Table structure for asset_sync_logs
-- ----------------------------
DROP TABLE IF EXISTS `asset_sync_logs`;
CREATE TABLE `asset_sync_logs`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `synced_count` int NULL DEFAULT 0,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `duration` int NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_asset_sync_logs_config`(`config_id` ASC) USING BTREE,
  INDEX `idx_asset_sync_logs_time`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Asset sync logs' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of asset_sync_logs
-- ----------------------------

-- ----------------------------
-- Table structure for blacklist_rules
-- ----------------------------
DROP TABLE IF EXISTS `blacklist_rules`;
CREATE TABLE `blacklist_rules`  (
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Rule unique ID',
  `command` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Command name',
  `pattern` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Match pattern (regex supported)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Rule description',
  `scope` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'global' COMMENT 'Scope: global, user',
  `users` json NULL COMMENT 'Restricted users (JSON array)',
  `enabled` tinyint(1) NULL DEFAULT 1 COMMENT 'Is enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_command`(`command` ASC) USING BTREE,
  INDEX `idx_enabled`(`enabled` ASC) USING BTREE,
  INDEX `idx_scope`(`scope` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Command blacklist rules' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of blacklist_rules
-- ----------------------------
INSERT INTO `blacklist_rules` VALUES ('2121017b-3a20-11f1-b90f-00163e065c32', 'rm', '^rm\\s+.*(-rf?|--recursive).*', 'Block dangerous file deletion', 'global', NULL, 1, '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `blacklist_rules` VALUES ('21212132-3a20-11f1-b90f-00163e065c32', 'dd', '^dd\\s+.*of=/dev/', 'Block disk overwrite', 'global', NULL, 1, '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `blacklist_rules` VALUES ('2121234a-3a20-11f1-b90f-00163e065c32', 'mkfs', '^mkfs\\.', 'Block filesystem formatting', 'global', NULL, 1, '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `blacklist_rules` VALUES ('2121244b-3a20-11f1-b90f-00163e065c32', 'reboot', '^(reboot|shutdown|halt|poweroff)', 'Block system restart', 'global', NULL, 1, '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `blacklist_rules` VALUES ('2121253f-3a20-11f1-b90f-00163e065c32', 'fdisk', '^fdisk\\s+/dev/', 'Block disk partitioning', 'global', NULL, 1, '2026-04-17 13:41:49', '2026-04-17 13:41:49');

-- ----------------------------
-- Table structure for command_histories
-- ----------------------------
DROP TABLE IF EXISTS `command_histories`;
CREATE TABLE `command_histories`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `proxy_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Proxy agent ID or \"api-server\"',
  `session_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Session ID',
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Target host ID',
  `user_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User ID',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Username',
  `host_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Target host IP',
  `command` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Executed command',
  `output` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Command output',
  `exit_code` int NULL DEFAULT NULL COMMENT 'Exit code',
  `executed_at` timestamp NOT NULL COMMENT 'Execution time',
  `duration_ms` bigint NULL DEFAULT NULL COMMENT 'Duration (milliseconds)',
  `is_dangerous` tinyint(1) NULL DEFAULT 0 COMMENT 'Matched blacklist',
  `blocked` tinyint(1) NULL DEFAULT 0 COMMENT 'Was blocked',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_session_id`(`session_id` ASC) USING BTREE,
  INDEX `idx_host_id`(`host_id` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_executed_at`(`executed_at` ASC) USING BTREE,
  INDEX `idx_is_dangerous`(`is_dangerous` ASC) USING BTREE,
  INDEX `idx_blocked`(`blocked` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Command execution history' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of command_histories
-- ----------------------------
INSERT INTO `command_histories` VALUES (1, 'api-server-direct', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', '00000000-0000-0000-0000-000000000001', 'admin', '47.109.187.158', 'ls', '', 0, '2026-04-17 14:04:40', 0, 0, 0, '2026-04-17 14:04:40');
INSERT INTO `command_histories` VALUES (2, 'api-server-direct', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', '00000000-0000-0000-0000-000000000001', 'admin', '47.109.187.158', 'su', '', 0, '2026-04-17 14:04:49', 0, 0, 0, '2026-04-17 14:04:49');
INSERT INTO `command_histories` VALUES (3, 'api-server-direct', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', '00000000-0000-0000-0000-000000000001', 'admin', '47.109.187.158', 'cd /', '', 0, '2026-04-17 14:04:54', 0, 0, 0, '2026-04-17 14:04:54');
INSERT INTO `command_histories` VALUES (4, 'api-server-direct', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', '00000000-0000-0000-0000-000000000001', 'admin', '47.109.187.158', 'ls', '', 0, '2026-04-17 14:04:56', 0, 0, 0, '2026-04-17 14:04:56');

-- ----------------------------
-- Table structure for expiration_notification_config
-- ----------------------------
DROP TABLE IF EXISTS `expiration_notification_config`;
CREATE TABLE `expiration_notification_config`  (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Type: user, permission',
  `warning_days` int NOT NULL DEFAULT 7 COMMENT 'Days before expiration to send warning',
  `enabled` tinyint(1) NULL DEFAULT 1 COMMENT 'Enable notification',
  `notification_channels` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Notification channels (JSON array): email, system, feishu, dingtalk',
  `message_template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Custom message template',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_type`(`type` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 3 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Expiration notification configuration' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of expiration_notification_config
-- ----------------------------
INSERT INTO `expiration_notification_config` VALUES (1, 'user', 7, 1, '[\"system\", \"email\"]', NULL, '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `expiration_notification_config` VALUES (2, 'permission', 3, 1, '[\"system\", \"email\"]', NULL, '2026-04-17 13:41:50', '2026-04-17 13:41:50');

-- ----------------------------
-- Table structure for file_transfers
-- ----------------------------
DROP TABLE IF EXISTS `file_transfers`;
CREATE TABLE `file_transfers`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_ip` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `host_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `direction` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `local_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `remote_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NULL DEFAULT 0,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'uploading',
  `progress` int NULL DEFAULT 0,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `transferred_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration` int NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_file_transfers_session`(`session_id` ASC) USING BTREE,
  INDEX `idx_file_transfers_user`(`user_id` ASC) USING BTREE,
  INDEX `idx_file_transfers_host`(`host_id` ASC) USING BTREE,
  INDEX `idx_file_transfers_filename`(`file_name` ASC) USING BTREE,
  INDEX `idx_file_transfers_time`(`transferred_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'File transfer audit records' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of file_transfers
-- ----------------------------

-- ----------------------------
-- Table structure for host_group_members
-- ----------------------------
DROP TABLE IF EXISTS `host_group_members`;
CREATE TABLE `host_group_members`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Group ID',
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Host ID',
  `added_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Who added this host to group',
  `added_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_group_host`(`group_id` ASC, `host_id` ASC) USING BTREE,
  INDEX `idx_group_id`(`group_id` ASC) USING BTREE,
  INDEX `idx_host_id`(`host_id` ASC) USING BTREE,
  INDEX `idx_group_host_idx`(`group_id` ASC, `host_id` ASC) USING BTREE,
  CONSTRAINT `host_group_members_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `host_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `host_group_members_ibfk_2` FOREIGN KEY (`host_id`) REFERENCES `hosts` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Host-Group relationship (many-to-many)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of host_group_members
-- ----------------------------
INSERT INTO `host_group_members` VALUES (16, 'default-group', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', '00000000-0000-0000-0000-000000000001', '2026-04-17 13:52:24');

-- ----------------------------
-- Table structure for host_groups
-- ----------------------------
DROP TABLE IF EXISTS `host_groups`;
CREATE TABLE `host_groups`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Group unique identifier',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Group name',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Group description',
  `color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Display color (hex code)',
  `icon` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Display icon',
  `sort_order` int NULL DEFAULT 0 COMMENT 'Display sort order',
  `created_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Creator user ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_name`(`name` ASC) USING BTREE,
  INDEX `idx_created_by`(`created_by` ASC) USING BTREE,
  INDEX `idx_sort_order`(`sort_order` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Host groups (user-defined)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of host_groups
-- ----------------------------
INSERT INTO `host_groups` VALUES ('default-group', 'Default', 'Default host group', '#1890ff', '', 0, NULL, '2026-04-17 13:41:49', '2026-04-17 13:41:49');

-- ----------------------------
-- Table structure for hosts
-- ----------------------------
DROP TABLE IF EXISTS `hosts`;
CREATE TABLE `hosts`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Host unique identifier',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Host name',
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'IP address',
  `port` int NULL DEFAULT 22 COMMENT 'SSH port',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'unknown' COMMENT 'Status: online, offline, unknown',
  `os` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Operating system',
  `cpu` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'CPU info',
  `memory` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Memory info',
  `device_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'linux' COMMENT 'Device type: linux, windows, vmware, docker, switch, router, firewall, storage, other',
  `connection_mode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'auto' COMMENT 'Connection mode: auto, direct, proxy',
  `proxy_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Specific proxy ID when connection_mode=proxy',
  `network_zone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Network zone for routing',
  `tags` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Tags (JSON array)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Description',
  `last_login_time` timestamp NULL DEFAULT NULL COMMENT 'Last login time',
  `login_count` int NULL DEFAULT 0 COMMENT 'Total login count',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_ip`(`ip` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_device_type`(`device_type` ASC) USING BTREE,
  INDEX `idx_connection_mode`(`connection_mode` ASC) USING BTREE,
  INDEX `idx_proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_network_zone`(`network_zone` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Host assets (authentication and protocol managed via system_users)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of hosts
-- ----------------------------
INSERT INTO `hosts` VALUES ('b87ee56f-3f1d-433a-b08f-6fe36b84076a', 'eva', '47.109.187.158', 22, 'online', '', '', '', 'linux', 'auto', '', '', '[\"测试\"]', '', '2026-04-17 14:20:13', 2, '2026-04-17 13:52:24', '2026-04-17 14:20:14');

-- ----------------------------
-- Table structure for login_records
-- ----------------------------
DROP TABLE IF EXISTS `login_records`;
CREATE TABLE `login_records`  (
  `id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Login record identifier (same as session_id)',
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID (platform user who logged into VM)',
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Host ID (虚拟机ID，必填)',
  `host_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Host name',
  `host_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Host IP',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Username (VM login username)',
  `login_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Login source IP',
  `user_agent` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User agent',
  `login_time` timestamp NOT NULL COMMENT 'Login time',
  `logout_time` timestamp NULL DEFAULT NULL COMMENT 'Logout time',
  `duration` int NULL DEFAULT NULL COMMENT 'Session duration (seconds)',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, completed, failed',
  `session_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Session ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_host_id`(`host_id` ASC) USING BTREE,
  INDEX `idx_login_time`(`login_time` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_user_host`(`user_id` ASC, `host_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'VM login records only (not for platform login)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of login_records
-- ----------------------------
INSERT INTO `login_records` VALUES ('83c36d81-3f6d-446a-b281-39a7ce7306ae', '00000000-0000-0000-0000-000000000001', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', 'eva', '47.109.187.158', 'admin', '', '', '2026-04-17 14:20:13', '2026-04-17 14:20:15', 1, 'completed', '83c36d81-3f6d-446a-b281-39a7ce7306ae', '2026-04-17 14:20:13');
INSERT INTO `login_records` VALUES ('ca5543f6-a8fb-420b-853e-7505f7f2320d', '00000000-0000-0000-0000-000000000001', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', 'eva', '47.109.187.158', 'admin', '', '', '2026-04-17 14:04:35', '2026-04-17 14:05:35', 60, 'completed', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', '2026-04-17 14:04:35');

-- ----------------------------
-- Table structure for permission_expiration_logs
-- ----------------------------
DROP TABLE IF EXISTS `permission_expiration_logs`;
CREATE TABLE `permission_expiration_logs`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `rule_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Permission rule ID',
  `rule_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Rule name',
  `user_group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User group ID',
  `user_group_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User group name',
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Action: warning_sent, expired, disabled, renewed',
  `valid_to` timestamp NULL DEFAULT NULL COMMENT 'Expiration time at the time of action',
  `new_valid_to` timestamp NULL DEFAULT NULL COMMENT 'New expiration time (for renewals)',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Reason or notes',
  `performed_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Admin user ID who performed the action',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_rule_id`(`rule_id` ASC) USING BTREE,
  INDEX `idx_user_group_id`(`user_group_id` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Permission rule expiration history logs' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of permission_expiration_logs
-- ----------------------------

-- ----------------------------
-- Table structure for permission_rule_host_groups
-- ----------------------------
DROP TABLE IF EXISTS `permission_rule_host_groups`;
CREATE TABLE `permission_rule_host_groups`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `permission_rule_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Permission rule ID',
  `host_group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Host group ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_rule_host_group`(`permission_rule_id` ASC, `host_group_id` ASC) USING BTREE,
  INDEX `idx_permission_rule_id`(`permission_rule_id` ASC) USING BTREE,
  INDEX `idx_host_group_id`(`host_group_id` ASC) USING BTREE,
  INDEX `idx_rule_group`(`permission_rule_id` ASC, `host_group_id` ASC) USING BTREE,
  CONSTRAINT `permission_rule_host_groups_ibfk_1` FOREIGN KEY (`permission_rule_id`) REFERENCES `permission_rules` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `permission_rule_host_groups_ibfk_2` FOREIGN KEY (`host_group_id`) REFERENCES `host_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Permission rule to host group mapping (many-to-many)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of permission_rule_host_groups
-- ----------------------------
INSERT INTO `permission_rule_host_groups` VALUES (1, '12843339-e856-4ad5-8f24-69f6861aa853', 'default-group', '2026-04-17 14:04:31');

-- ----------------------------
-- Table structure for permission_rule_system_users
-- ----------------------------
DROP TABLE IF EXISTS `permission_rule_system_users`;
CREATE TABLE `permission_rule_system_users`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `permission_rule_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Permission rule ID',
  `system_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'System user ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_rule_system_user`(`permission_rule_id` ASC, `system_user_id` ASC) USING BTREE,
  INDEX `idx_permission_rule_id`(`permission_rule_id` ASC) USING BTREE,
  INDEX `idx_system_user_id`(`system_user_id` ASC) USING BTREE,
  INDEX `idx_rule_user`(`permission_rule_id` ASC, `system_user_id` ASC) USING BTREE,
  CONSTRAINT `permission_rule_system_users_ibfk_1` FOREIGN KEY (`permission_rule_id`) REFERENCES `permission_rules` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `permission_rule_system_users_ibfk_2` FOREIGN KEY (`system_user_id`) REFERENCES `system_users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Permission rule to system user mapping (many-to-many)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of permission_rule_system_users
-- ----------------------------
INSERT INTO `permission_rule_system_users` VALUES (1, '12843339-e856-4ad5-8f24-69f6861aa853', '2055e47e-b9f7-4eb3-bf99-3c18af29ed65', '2026-04-17 14:04:31');

-- ----------------------------
-- Table structure for permission_rules
-- ----------------------------
DROP TABLE IF EXISTS `permission_rules`;
CREATE TABLE `permission_rules`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Permission rule unique identifier',
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Rule name',
  `user_group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User group ID',
  `host_group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Host group ID (NULL = all hosts)',
  `host_ids` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Specific host IDs (JSON array, optional)',
  `system_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'System user ID (nullable, using many-to-many table)',
  `valid_from` timestamp NULL DEFAULT NULL COMMENT 'Valid from (NULL = no start limit)',
  `valid_to` timestamp NULL DEFAULT NULL COMMENT 'Valid to (NULL = no end limit)',
  `enabled` tinyint(1) NULL DEFAULT 1 COMMENT 'Is enabled',
  `priority` int NULL DEFAULT 0 COMMENT 'Priority (higher = preferred)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Description',
  `created_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Creator user ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_user_group_id`(`user_group_id` ASC) USING BTREE,
  INDEX `idx_host_group_id`(`host_group_id` ASC) USING BTREE,
  INDEX `idx_system_user_id`(`system_user_id` ASC) USING BTREE,
  INDEX `idx_enabled`(`enabled` ASC) USING BTREE,
  INDEX `idx_valid_from`(`valid_from` ASC) USING BTREE,
  INDEX `idx_valid_to`(`valid_to` ASC) USING BTREE,
  INDEX `idx_user_group_enabled`(`user_group_id` ASC, `enabled` ASC) USING BTREE,
  CONSTRAINT `permission_rules_ibfk_1` FOREIGN KEY (`user_group_id`) REFERENCES `user_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `permission_rules_ibfk_2` FOREIGN KEY (`host_group_id`) REFERENCES `host_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `permission_rules_ibfk_3` FOREIGN KEY (`system_user_id`) REFERENCES `system_users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Permission rules (UserGroup + SystemUser + HostGroup)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of permission_rules
-- ----------------------------
INSERT INTO `permission_rules` VALUES ('12843339-e856-4ad5-8f24-69f6861aa853', 'eva', '21bff3a4-3a20-11f1-b90f-00163e065c32', NULL, '', NULL, NULL, NULL, 1, 0, '', '00000000-0000-0000-0000-000000000001', '2026-04-17 14:04:31', '2026-04-17 14:04:31');

-- ----------------------------
-- Table structure for platform_login_records
-- ----------------------------
DROP TABLE IF EXISTS `platform_login_records`;
CREATE TABLE `platform_login_records`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Login record ID',
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID',
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Username',
  `login_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Login source IP',
  `user_agent` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User agent (browser info)',
  `login_time` timestamp NOT NULL COMMENT 'Login time',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, logged_out',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_login_time`(`login_time` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Platform login records (user login to ZJump platform)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of platform_login_records
-- ----------------------------
INSERT INTO `platform_login_records` VALUES ('15fdc0fa-9aaa-400a-aada-559f270b6ada', '00000000-0000-0000-0000-000000000001', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '2026-04-17 13:47:10', 'active', '2026-04-17 13:47:10');
INSERT INTO `platform_login_records` VALUES ('a66731d6-3b85-455b-a5ec-4e83134a2673', '00000000-0000-0000-0000-000000000001', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '2026-04-17 14:09:27', 'active', '2026-04-17 14:09:27');

-- ----------------------------
-- Table structure for proxies
-- ----------------------------
DROP TABLE IF EXISTS `proxies`;
CREATE TABLE `proxies`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `proxy_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Proxy unique ID',
  `host_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Proxy host name',
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Proxy IP address',
  `port` int NULL DEFAULT NULL COMMENT 'Proxy port',
  `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Proxy type: ssh, rdp',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'offline' COMMENT 'Status: online, offline',
  `version` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Proxy version',
  `network_zone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Network zone',
  `start_time` timestamp NULL DEFAULT NULL COMMENT 'Proxy start time',
  `last_heartbeat` timestamp NULL DEFAULT NULL COMMENT 'Last heartbeat time',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_network_zone`(`network_zone` ASC) USING BTREE,
  INDEX `idx_last_heartbeat`(`last_heartbeat` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Proxy agents status and registration (unified)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of proxies
-- ----------------------------

-- ----------------------------
-- Table structure for session_histories
-- ----------------------------
DROP TABLE IF EXISTS `session_histories`;
CREATE TABLE `session_histories`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `proxy_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Proxy agent ID or \"api-server\" for direct',
  `session_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Unique session identifier',
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Target host ID',
  `user_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User ID',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Username',
  `host_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Target host IP',
  `start_time` timestamp NOT NULL COMMENT 'Session start time',
  `end_time` timestamp NULL DEFAULT NULL COMMENT 'Session end time (NULL if active)',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, closed',
  `recording` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Session recording (Asciinema format)',
  `terminal_cols` int NULL DEFAULT 120 COMMENT 'Terminal columns',
  `terminal_rows` int NULL DEFAULT 30 COMMENT 'Terminal rows',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `session_id`(`session_id` ASC) USING BTREE,
  INDEX `idx_proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_session_id`(`session_id` ASC) USING BTREE,
  INDEX `idx_host_id`(`host_id` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_start_time`(`start_time` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Session history with recordings' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of session_histories
-- ----------------------------

-- ----------------------------
-- Table structure for session_recordings
-- ----------------------------
DROP TABLE IF EXISTS `session_recordings`;
CREATE TABLE `session_recordings`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Unique recording identifier (UUID)',
  `session_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Session identifier',
  `connection_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'webshell' COMMENT 'Connection type: webshell, ssh_gateway, ssh_client',
  `proxy_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Proxy agent ID or \"api-server-direct\"',
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'User ID',
  `host_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Target host ID',
  `host_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Host name',
  `host_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Host IP address',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Username',
  `start_time` timestamp NOT NULL COMMENT 'Session start time',
  `end_time` timestamp NULL DEFAULT NULL COMMENT 'Session end time (NULL if active)',
  `duration` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Session duration (formatted string)',
  `command_count` int NULL DEFAULT 0 COMMENT 'Number of commands executed',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Session status: active, closed',
  `recording` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Session recording data (Asciinema format)',
  `terminal_cols` int NULL DEFAULT 80 COMMENT 'Terminal columns',
  `terminal_rows` int NULL DEFAULT 24 COMMENT 'Terminal rows',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `session_id`(`session_id` ASC) USING BTREE,
  INDEX `idx_session_id`(`session_id` ASC) USING BTREE,
  INDEX `idx_connection_type`(`connection_type` ASC) USING BTREE,
  INDEX `idx_proxy_id`(`proxy_id` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_host_id`(`host_id` ASC) USING BTREE,
  INDEX `idx_start_time`(`start_time` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Unified session recordings from webshell and direct SSH connections' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of session_recordings
-- ----------------------------
INSERT INTO `session_recordings` VALUES ('384160a8-0ac5-4a04-96c3-ced6a4580b51', 'ca5543f6-a8fb-420b-853e-7505f7f2320d', 'webshell', '', '00000000-0000-0000-0000-000000000001', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', 'eva', '47.109.187.158', 'admin', '2026-04-17 14:04:35', '2026-04-17 14:05:35', '1m 0s', 4, 'closed', '{\"version\":2,\"width\":120,\"height\":30,\"timestamp\":1776405874,\"env\":{\"TERM\":\"xterm-256color\"}}\n[0.4462953,\"o\",\"\\r\\nWelcome to Alibaba Cloud Elastic Compute Service !\\r\\n\\r\\nUpdates Information Summary: available\\r\\n    61 Security notice(s)\\r\\n        22 Important Security notice(s)\\r\\n        39 Moderate Security notice(s)\\r\\nRun \\\"dnf upgrade-minimal --security\\\" to apply all updates.More details please refer to:\\r\\nhttps://help.aliyun.com/document_detail/416274.html\\r\\nLast failed login: Mon Apr 13 10:30:30 CST 2026 from 111.19.212.140 on ssh:notty\\r\\nThere were 31 failed login attempts since the last successful login.\\r\\nLast login: Wed Mar 18 13:35:53 2026 from 127.0.0.1\\r\\r\\n\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:~\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z ~]# \"]\n[4.3525691,\"i\",\"ls\"]\n[4.3594208,\"o\",\"ls\"]\n[4.9163471,\"i\",\"\\r\"]\n[4.9334797,\"o\",\"\\r\\ninstall_panel.sh\\r\\n\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:~\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z ~]# \"]\n[13.292172,\"i\",\"s\"]\n[13.2982455,\"o\",\"s\"]\n[13.4278066,\"i\",\"u\"]\n[13.4345152,\"o\",\"u\"]\n[14.2853684,\"i\",\"\\r\"]\n[14.2930718,\"o\",\"\\r\\n\"]\n[14.3615859,\"o\",\"\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:~\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z ~]# \"]\n[18.1571069,\"i\",\"c\"]\n[18.1633959,\"o\",\"c\"]\n[18.2520877,\"i\",\"d\"]\n[18.2630677,\"o\",\"d\"]\n[18.4531783,\"i\",\" \"]\n[18.4615074,\"o\",\" \"]\n[18.6273831,\"i\",\"/\"]\n[18.6476704,\"o\",\"/\"]\n[19.3170511,\"i\",\"\\r\"]\n[19.3237151,\"o\",\"\\r\\n\"]\n[19.3883398,\"o\",\"\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:/\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z /]# \"]\n[20.7324759,\"i\",\"l\"]\n[20.7391802,\"o\",\"l\"]\n[20.8520401,\"i\",\"s\"]\n[20.8575349,\"o\",\"s\"]\n[21.124712,\"i\",\"\\r\"]\n[21.1312685,\"o\",\"\\r\\n\"]\n[21.1965083,\"o\",\"\\u001b[0m\\u001b[38;5;51mbin\\u001b[0m  \\u001b[38;5;33mboot\\u001b[0m  \\u001b[38;5;33mdev\\u001b[0m  \\u001b[38;5;33metc\\u001b[0m  \\u001b[38;5;33mhome\\u001b[0m  \\u001b[38;5;51mlib\\u001b[0m  \\u001b[38;5;51mlib64\\u001b[0m  \\u001b[38;5;33mlost+found\\u001b[0m  \\u001b[38;5;33mmedia\\u001b[0m  \\u001b[38;5;33mmnt\\u001b[0m  \\u001b[38;5;33mopt\\u001b[0m  \\u001b[38;5;33mproc\\u001b[0m  \\u001b[38;5;33mroot\\u001b[0m  \\u001b[38;5;33mrun\\u001b[0m  \\u001b[38;5;51msbin\\u001b[0m  \\u001b[38;5;33msrv\\u001b[0m  \\u001b[38;5;33msys\\u001b[0m  \\u001b[48;5;10;38;5;16mtmp\\u001b[0m  \\u001b[38;5;33musr\\u001b[0m  \\u001b[38;5;33mvar\\u001b[0m  \\u001b[38;5;33mwww\\u001b[0m\\r\\n\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:/\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z /]# \"]\n', 120, 30, '2026-04-17 14:04:35', '2026-04-17 14:05:35');
INSERT INTO `session_recordings` VALUES ('60b999f8-044d-467b-8f70-33420d73e7b6', '83c36d81-3f6d-446a-b281-39a7ce7306ae', 'webshell', '', '00000000-0000-0000-0000-000000000001', 'b87ee56f-3f1d-433a-b08f-6fe36b84076a', 'eva', '47.109.187.158', 'admin', '2026-04-17 14:20:13', '2026-04-17 14:20:15', '0m 1s', 0, 'closed', '{\"version\":2,\"width\":120,\"height\":30,\"timestamp\":1776406813,\"env\":{\"TERM\":\"xterm-256color\"}}\n[0.4353412,\"o\",\"\\r\\nWelcome to Alibaba Cloud Elastic Compute Service !\\r\\n\\r\\nUpdates Information Summary: available\\r\\n    61 Security notice(s)\\r\\n        22 Important Security notice(s)\\r\\n        39 Moderate Security notice(s)\\r\\nRun \\\"dnf upgrade-minimal --security\\\" to apply all updates.More details please refer to:\\r\\nhttps://help.aliyun.com/document_detail/416274.html\\r\\nLast login: Fri Apr 17 14:04:48 2026\\r\\r\\n\\u001b]0;root@iZ2vc4ss09pl7wr65q12w0Z:~\\u0007[root@iZ2vc4ss09pl7wr65q12w0Z ~]# \"]\n', 120, 30, '2026-04-17 14:20:14', '2026-04-17 14:20:15');

-- ----------------------------
-- Table structure for settings
-- ----------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings`  (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Setting key',
  `value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Setting value',
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Category: system, ldap, sso, security, audit, notification, terminal, upload',
  `type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Type: string, number, boolean, json',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `key`(`key` ASC) USING BTREE,
  INDEX `idx_key`(`key` ASC) USING BTREE,
  INDEX `idx_category`(`category` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 64 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'System settings' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of settings
-- ----------------------------
INSERT INTO `settings` VALUES (1, 'system.title', 'ZJump Bastion Host', 'system', 'string', '2026-04-17 13:41:49', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (2, 'system.session_timeout', '3600', 'system', 'number', '2026-04-17 13:41:49', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (3, 'security.max_login_attempts', '5', 'security', 'number', '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `settings` VALUES (4, 'security.lockout_duration', '1800', 'security', 'number', '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `settings` VALUES (5, 'audit.enable_command_recording', 'true', 'audit', 'boolean', '2026-04-17 13:41:49', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (6, 'audit.enable_session_recording', 'true', 'audit', 'boolean', '2026-04-17 13:41:49', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (7, 'terminal.default_cols', '120', 'terminal', 'number', '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `settings` VALUES (8, 'terminal.default_rows', '30', 'terminal', 'number', '2026-04-17 13:41:49', '2026-04-17 13:41:49');
INSERT INTO `settings` VALUES (9, 'host_monitor_enabled', 'true', 'host_monitor', 'string', '2026-04-17 13:41:50', '2026-04-17 13:53:26');
INSERT INTO `settings` VALUES (10, 'host_monitor_interval', '5', 'host_monitor', 'string', '2026-04-17 13:41:50', '2026-04-17 13:53:26');
INSERT INTO `settings` VALUES (11, 'host_monitor_method', 'tcp', 'host_monitor', 'string', '2026-04-17 13:41:50', '2026-04-17 13:53:26');
INSERT INTO `settings` VALUES (12, 'host_monitor_timeout', '3', 'host_monitor', 'string', '2026-04-17 13:41:50', '2026-04-17 13:53:26');
INSERT INTO `settings` VALUES (13, 'host_monitor_concurrent', '20', 'host_monitor', 'string', '2026-04-17 13:41:50', '2026-04-17 13:53:26');
INSERT INTO `settings` VALUES (14, 'expiration_check_enabled', 'true', 'expiration', 'boolean', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (15, 'expiration_check_interval', '3600', 'expiration', 'number', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (16, 'user_expiration_auto_disable', 'true', 'expiration', 'boolean', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (17, 'permission_expiration_auto_disable', 'true', 'expiration', 'boolean', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (18, 'expiration_warning_days_user', '7', 'expiration', 'number', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (19, 'expiration_warning_days_permission', '3', 'expiration', 'number', '2026-04-17 13:41:50', '2026-04-17 13:41:50');
INSERT INTO `settings` VALUES (20, 'authMethod', 'password', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (21, 'passwordComplexity', 'true', 'auth', 'boolean', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (22, 'ldapUserFilter', '(uid={username})', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (23, 'passwordLoginEnabled', 'true', 'auth', 'boolean', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (24, 'ldapEnabled', 'false', 'auth', 'boolean', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (25, 'ldapBindPassword', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (26, 'ssoUserInfoUrl', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (27, 'passwordMinLength', '8', 'auth', 'number', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (28, 'passwordSessionTimeout', '30', 'auth', 'number', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (29, 'ssoEnabled', 'false', 'auth', 'boolean', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (30, 'ssoProvider', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (31, 'ssoClientSecret', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (32, 'ssoAuthUrl', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (33, 'ldapPort', '389', 'auth', 'number', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (34, 'ssoClientId', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (35, 'ssoScopes', 'openid email profile', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (36, 'ldapServer', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (37, 'ldapBindDn', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (38, 'ldapBaseDn', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (39, 'ldapUseTLS', 'false', 'auth', 'boolean', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (40, 'ssoTokenUrl', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (41, 'ssoRedirectUrl', '', 'auth', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (42, 'siteName', '堡垒机', 'system', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (43, 'siteDescription', '企业级SSH跳板机管理平台', 'system', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (44, 'adminEmail', '1317953460@qq,com', 'system', 'string', '2026-04-17 14:20:39', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (45, 'autoReconnect', 'true', 'system', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (46, 'enableSessionRecording', 'false', 'audit', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (47, 'enableRealTimeAudit', 'true', 'audit', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (48, 'enableDangerousCommandAlert', 'true', 'audit', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (49, 'recordingFormat', 'asciinema', 'audit', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (50, 'sessionRetentionDays', '90', 'audit', 'number', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (51, 'commandRetentionDays', '180', 'audit', 'number', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (52, 'alertEmails', 'security@example.com', 'audit', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (53, 'enableFileTransferAudit', 'true', 'audit', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (54, 'wechatCorpId', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (55, 'feishuSecret', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (56, 'enableDingTalk', 'false', 'notification', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (57, 'dingTalkWebhook', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (58, 'dingTalkSecret', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (59, 'wechatAgentId', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (60, 'wechatSecret', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:09');
INSERT INTO `settings` VALUES (61, 'enableFeishu', 'false', 'notification', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (62, 'feishuWebhook', '', 'notification', 'string', '2026-04-17 14:20:40', '2026-04-17 14:21:08');
INSERT INTO `settings` VALUES (63, 'enableWeChat', 'false', 'notification', 'boolean', '2026-04-17 14:20:40', '2026-04-17 14:21:09');

-- ----------------------------
-- Table structure for ssh_host_keys
-- ----------------------------
DROP TABLE IF EXISTS `ssh_host_keys`;
CREATE TABLE `ssh_host_keys`  (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `key_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'rsa' COMMENT 'Key type: rsa, ecdsa, ed25519',
  `key_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'default' COMMENT 'Key name for different purposes',
  `private_key` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SSH private key (PEM format)',
  `public_key` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SSH public key',
  `fingerprint` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SSH key fingerprint (SHA256)',
  `key_size` int NULL DEFAULT 2048 COMMENT 'Key size in bits',
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Description or comment',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_key_type_name`(`key_type` ASC, `key_name` ASC) USING BTREE,
  INDEX `idx_key_name`(`key_name` ASC) USING BTREE,
  INDEX `idx_fingerprint`(`fingerprint` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'SSH host keys shared across all instances for consistent client experience' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of ssh_host_keys
-- ----------------------------
INSERT INTO `ssh_host_keys` VALUES (1, 'rsa', 'default', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsQQ+8qX8cUNoi64PXlQR8iaHZcQXsmeQCNxrvQvKv2iSt8O7\nw+fLBtlBkEDdxibMVmZs6oGnBDTQw1Ma/5SZIze/MwgfWyxAhghs2ZQm2qeMArS5\nAjcEGjjRtadS2790M1qX3eloymQbzASKOyp/1CGQwZPSEEVDOgtYn9IjcAeWpgRo\n22gLCVC5ywPjB/C+JA+NJ149PpdUZdYNOLElRKJwkqo9m68S+cfGeyN+hUhAMFTC\nvYD/K65esrVojccVNvbATY7pznr2Hz6fcPSQIN/ac9N8QanjN9AkBnEVEpAcQPaI\nGCvk8WcYdSu11kSCifyFSqmkeLLuefZzlpsohwIDAQABAoIBABxnZgJhiARUoK3p\nHCYyrz5/2DIIKRVDcOU7GT6YacwU55X9Hl/tDbLnoZGYFv34s8kZXliyvS37m5P7\n/dUM7xWrmE6D+yQSEbhwGadAEov7XogAn78vPMVIYL4ZPz5rliW3X68ICPyQ27T8\n9YFQ7HoJeMTXB1n9AzCJKYtbmLwc90kfYQdRLQArm8k7kkUDgw36hquGZ/a/Szgx\nhRGMYrha6qa+HoNGhBzNKGcqcNPUv5X8ibWJ20g6BAGX3aYQoyzq9p244K1y7PV1\nnf/T8KFm6wLiUn6ZF+zRYCNcuGtGfiIlmLjZQOTYE4GJ/5vJvWrYkAhODXF4SBEo\nHEJkWqECgYEA11j+jsznSh6fHeAfQDHDIG9oDpT9zDVtvOMKubsn36NPKeTAtPbT\npJmB/ppwoZ8ACt0V1h3gBA5W/5KNkO/lrKEcs0Yx4wGsHcrhzSMTgpk4P547s0/w\niMgc7OSci+NjOIGdzKbAaMHw2Q5vwb8CL4KVXh4UTAaKOg6ovd+KxHUCgYEA0m7Y\nOkuZ3mOFmK8F2mx7g8R87PISERfJbzXAlYiaA5dzVjgRuCEVSXzFzNYD+g6On/to\n/3a94aYfRxVZnprnUXgyk5W9E+Oafu31UxjDJb5kBCaTqV9IC1Ip5IoyHnX+aEKE\nlCQnLriK+ug09pRBnQUdd5XLo2/HrnG53AUk6YsCgYEAuz/9CPqO2tpJjVbGlbEv\ndFKq7pMLJLgIlcfuGZXtk/6S5WCtWC2P1n5MlLCB42c4SDn5tNcBZUV6zHwIcNDI\nqxTkudX9puBbYwR410D6xAKq8FaMntyR0L4AuNQIc3LjYc0DA2Kzx+Nro7Fz58pJ\nAjrP2qjZCUpegyEgBQoNxckCgYAFvOYCeOtCKB6NckBLm2emySXK5DLf6nEgqiuN\nKENi069ea3r4NVa6QT+3fSJwoBL9g8JyLM+ypm/15TwjWf/ytb9TTOLx9uPQkDZ/\nRI6VqeJaRp8CIEn7nQrtY2NId1kviJjK3U2ANaH8g3ZmPtanLGuIRjpeQ38DX7B8\nsls2TwKBgD0UHaRsVQGwWhOZq1iC5PgtrLJXv4npL7Wg52PSq5xj0dDu2GRIoju1\nixFdL0tsPa+hjDOktk4TQtELibh7eC7CqH+KE3JcLaTX/h8sLhWCkxZ/abWXg716\nVIjgmpBUN62kkUoXFK54l8gJ/OlHCRF4A1iNgih8yGl2OjPYf8U3\n-----END RSA PRIVATE KEY-----\n', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCxBD7ypfxxQ2iLrg9eVBHyJodlxBeyZ5AI3Gu9C8q/aJK3w7vD58sG2UGQQN3GJsxWZmzqgacENNDDUxr/lJkjN78zCB9bLECGCGzZlCbap4wCtLkCNwQaONG1p1Lbv3QzWpfd6WjKZBvMBIo7Kn/UIZDBk9IQRUM6C1if0iNwB5amBGjbaAsJULnLA+MH8L4kD40nXj0+l1Rl1g04sSVEonCSqj2brxL5x8Z7I36FSEAwVMK9gP8rrl6ytWiNxxU29sBNjunOevYfPp9w9JAg39pz03xBqeM30CQGcRUSkBxA9ogYK+TxZxh1K7XWRIKJ/IVKqaR4su559nOWmyiH\n', 'SHA256:TXnU8I3GDUhJwI3680qOuuv+OUMcYRvCBWcUETLYQG0', 2048, 'Shared SSH host key for multi-instance deployment - Generated at 2026-04-17T13:42:14+08:00', '2026-04-17 13:42:15', '2026-04-17 13:42:15');

-- ----------------------------
-- Table structure for system_users
-- ----------------------------
DROP TABLE IF EXISTS `system_users`;
CREATE TABLE `system_users`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'System user unique identifier',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'System user name (display name)',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'OS username (e.g., root, admin, dev)',
  `auth_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'password' COMMENT 'Auth type: password, key',
  `password` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Encrypted password',
  `private_key` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'SSH private key',
  `passphrase` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Private key passphrase',
  `protocol` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'ssh' COMMENT 'Protocol: ssh, rdp',
  `priority` int NULL DEFAULT 0 COMMENT 'Priority (higher = preferred)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Description',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, inactive',
  `created_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Creator user ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_username`(`username` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_protocol`(`protocol` ASC) USING BTREE,
  INDEX `idx_priority`(`priority` ASC) USING BTREE,
  INDEX `idx_status_priority`(`status` ASC, `priority` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'System users (OS users on target hosts)' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of system_users
-- ----------------------------
INSERT INTO `system_users` VALUES ('2055e47e-b9f7-4eb3-bf99-3c18af29ed65', 'eva', 'root', 'password', '@Feng4357ab32', '', '', 'ssh', 0, '', 'active', '00000000-0000-0000-0000-000000000001', '2026-04-17 14:03:02', '2026-04-17 14:03:44');

-- ----------------------------
-- Table structure for two_factor_config
-- ----------------------------
DROP TABLE IF EXISTS `two_factor_config`;
CREATE TABLE `two_factor_config`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `enabled` tinyint(1) NULL DEFAULT 0 COMMENT 'Whether global 2FA is enabled',
  `issuer` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'ZJump' COMMENT '2FA issuer name',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Global 2FA configuration' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of two_factor_config
-- ----------------------------
INSERT INTO `two_factor_config` VALUES (1, 0, 'ZJump', '2026-04-17 13:41:50', '2026-04-17 13:41:50');

-- ----------------------------
-- Table structure for user_expiration_logs
-- ----------------------------
DROP TABLE IF EXISTS `user_expiration_logs`;
CREATE TABLE `user_expiration_logs`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID',
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Username',
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Action: warning_sent, expired, disabled, renewed',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'Expiration time at the time of action',
  `new_expires_at` timestamp NULL DEFAULT NULL COMMENT 'New expiration time (for renewals)',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Reason or notes',
  `performed_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Admin user ID who performed the action',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_username`(`username` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'User expiration history logs' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of user_expiration_logs
-- ----------------------------

-- ----------------------------
-- Table structure for user_group_members
-- ----------------------------
DROP TABLE IF EXISTS `user_group_members`;
CREATE TABLE `user_group_members`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_group_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User group ID',
  `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID',
  `added_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Who added this user',
  `added_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_user_group_user`(`user_group_id` ASC, `user_id` ASC) USING BTREE,
  INDEX `idx_user_group_id`(`user_group_id` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_user_group`(`user_id` ASC, `user_group_id` ASC) USING BTREE,
  CONSTRAINT `user_group_members_ibfk_1` FOREIGN KEY (`user_group_id`) REFERENCES `user_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `user_group_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'User group membership' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of user_group_members
-- ----------------------------
INSERT INTO `user_group_members` VALUES (1, '21bff3a4-3a20-11f1-b90f-00163e065c32', '00000000-0000-0000-0000-000000000001', NULL, '2026-04-17 13:41:50');

-- ----------------------------
-- Table structure for user_groups
-- ----------------------------
DROP TABLE IF EXISTS `user_groups`;
CREATE TABLE `user_groups`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User group unique identifier',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Group name',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Group description',
  `color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Display color (hex code)',
  `icon` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Display icon',
  `priority` int NULL DEFAULT 0 COMMENT 'Priority',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, inactive',
  `created_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Creator user ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `name`(`name` ASC) USING BTREE,
  INDEX `idx_name`(`name` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_priority`(`priority` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'User groups for permission management' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of user_groups
-- ----------------------------
INSERT INTO `user_groups` VALUES ('21bff3a4-3a20-11f1-b90f-00163e065c32', 'Administrators', 'Administrator user group', '#f5222d', NULL, 0, 'active', NULL, '2026-04-17 13:41:50', '2026-04-17 13:41:50');

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User unique identifier',
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Username for login',
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Encrypted password',
  `ssh_public_key` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'SSH public key for authentication',
  `ssh_private_key_encrypted` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Encrypted SSH private key (for user download)',
  `auth_method` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'password' COMMENT 'Authentication method: password, publickey, both',
  `ssh_key_generated_at` timestamp NULL DEFAULT NULL COMMENT 'When the SSH key was generated',
  `ssh_key_fingerprint` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'SSH key fingerprint (SHA256)',
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Email address',
  `full_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Full name',
  `role` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'user' COMMENT 'Role: admin, user',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active' COMMENT 'Status: active, inactive',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'Account expiration time (NULL = never expires)',
  `expiration_warning_sent` tinyint(1) NULL DEFAULT 0 COMMENT 'Whether expiration warning has been sent',
  `auto_disable_on_expiry` tinyint(1) NULL DEFAULT 1 COMMENT 'Auto disable account when expired',
  `last_login_time` timestamp NULL DEFAULT NULL COMMENT 'Last login time',
  `last_login_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Last login IP address',
  `two_factor_enabled` tinyint(1) NULL DEFAULT 0 COMMENT 'Whether 2FA is enabled for this user',
  `two_factor_secret` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '2FA secret key (encrypted)',
  `two_factor_backup_codes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '2FA backup codes (JSON array, encrypted)',
  `two_factor_verified_at` timestamp NULL DEFAULT NULL COMMENT 'When 2FA was verified and enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username` ASC) USING BTREE,
  UNIQUE INDEX `email`(`email` ASC) USING BTREE,
  INDEX `idx_username`(`username` ASC) USING BTREE,
  INDEX `idx_email`(`email` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_role`(`role` ASC) USING BTREE,
  INDEX `idx_auth_method`(`auth_method` ASC) USING BTREE,
  INDEX `idx_expires_at`(`expires_at` ASC) USING BTREE,
  INDEX `idx_two_factor_enabled`(`two_factor_enabled` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Platform users with SSH key authentication support' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES ('00000000-0000-0000-0000-000000000001', 'admin', '$2a$10$aKA5OYSDn5oznwTaGtyu1eg31ToxIIyaHtXSOsHYGLf6USBDHn1cC', '', '', 'password', NULL, '', 'admin@zjump.local', 'System Admin', 'admin', 'active', NULL, 0, 1, '2026-04-17 14:09:27', '::1', 0, '', '', NULL, '2026-04-17 13:41:50', '2026-04-17 14:09:27');

SET FOREIGN_KEY_CHECKS = 1;
