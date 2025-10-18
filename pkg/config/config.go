package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Redis    RedisConfig    `yaml:"redis"`
	Security SecurityConfig `yaml:"security"`
	Logging  LoggingConfig  `yaml:"logging"`
	SSH      SSHConfig      `yaml:"ssh"`
	Sync     SyncConfig     `yaml:"sync"`
}

type ServerConfig struct {
	APIPort          int    `yaml:"api_port"`
	SSHPort          int    `yaml:"ssh_port"` // SSH Gateway 端口
	LinuxProxyPort   int    `yaml:"linux_proxy_port"`
	WindowsProxyPort int    `yaml:"windows_proxy_port"` // WIP: 计划支持 RDP
	BackendURL       string `yaml:"backend_url"`
	Mode             string `yaml:"mode"`
	ProxyID          string `yaml:"proxy_id"` // 可选：指定固定的 Proxy ID
}

type DatabaseConfig struct {
	Host            string `yaml:"host"`
	Port            int    `yaml:"port"`
	User            string `yaml:"user"`
	Password        string `yaml:"password"`
	DBName          string `yaml:"dbname"`
	MaxIdleConns    int    `yaml:"max_idle_conns"`
	MaxOpenConns    int    `yaml:"max_open_conns"`
	ConnMaxLifetime int    `yaml:"conn_max_lifetime"`
}

type RedisConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type SecurityConfig struct {
	JWTSecret      string `yaml:"jwt_secret"`
	SessionTimeout int    `yaml:"session_timeout"`
	EncryptKey     string `yaml:"encrypt_key"`
}

type LoggingConfig struct {
	Level      string `yaml:"level"`       // debug / info / warn / error
	Output     string `yaml:"output"`      // console / file / both
	File       string `yaml:"file"`        // 日志文件路径
	MaxSize    int    `yaml:"max_size"`    // 单个文件最大大小（MB）
	MaxBackups int    `yaml:"max_backups"` // 保留的旧日志文件数量
	MaxAge     int    `yaml:"max_age"`     // 保留日志的最大天数
	Compress   bool   `yaml:"compress"`    // 是否压缩旧日志
}

type SSHConfig struct {
	Timeout           int `yaml:"timeout"`
	KeepaliveInterval int `yaml:"keepalive_interval"`
	MaxSessions       int `yaml:"max_sessions"`
}

type SyncConfig struct {
	Interval    int `yaml:"interval"`     // 同步间隔（秒），默认60秒
	CleanupDays int `yaml:"cleanup_days"` // 清理已同步数据的天数，默认7天
	BatchSize   int `yaml:"batch_size"`   // 每次同步的批量大小，默认1000
}

var GlobalConfig *Config

func Load(configPath string) (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	GlobalConfig = &config
	return &config, nil
}

func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		c.User, c.Password, c.Host, c.Port, c.DBName)
}
