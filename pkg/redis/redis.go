package redis

import (
	"context"
	"fmt"
	"log"

	"github.com/fisker/zjump-backend/pkg/config"
	"github.com/go-redis/redis/v8"
)

var (
	// Client 全局 Redis 客户端
	Client *redis.Client
)

// Init 初始化 Redis 连接
func Init(cfg *config.RedisConfig) error {
	if !cfg.Enabled {
		log.Println("[Redis] Redis is disabled in config")
		return nil
	}

	Client = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	// 测试连接
	ctx := context.Background()
	if err := Client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Printf("[Redis] Connected to Redis at %s:%d", cfg.Host, cfg.Port)
	return nil
}

// Close 关闭 Redis 连接
func Close() error {
	if Client != nil {
		return Client.Close()
	}
	return nil
}

// IsEnabled 检查 Redis 是否启用
func IsEnabled() bool {
	return Client != nil
}
