package database

import (
	"fmt"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/pkg/config"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(cfg *config.DatabaseConfig) error {
	var err error

	dsn := cfg.DSN()

	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
		// 使用 Warn 级别，避免记录 ErrRecordNotFound 等正常的查询结果
		Logger: logger.Default.LogMode(logger.Warn),
	})

	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}

	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Second)

	// 自动迁移（已禁用，表结构已创建好，如需迁移请手动调用 AutoMigrate()）
	// if err := AutoMigrate(); err != nil {
	// 	return fmt.Errorf("failed to migrate database: %w", err)
	// }

	return nil
}

func AutoMigrate() error {
	return DB.AutoMigrate(
		&model.Host{},
		&model.LoginRecord{},
		&model.SSHSession{},
		&model.SessionRecording{},
		&model.CommandRecord{},
		&model.Proxy{},
		&model.CommandHistory{},
		&model.SessionHistory{},
		&model.Setting{},
	)
}

func Close() error {
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
