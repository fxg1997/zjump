package middleware

import (
	"net/http"
	"strings"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/gin-gonic/gin"
)

// AuthMiddleware validates JWT credentials for authenticated API routes.
func AuthMiddleware(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prefer the Authorization header, but allow query tokens for
		// browser-triggered downloads where custom headers are not available.
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				c.JSON(http.StatusUnauthorized, model.Error(401, "Token format is invalid"))
				c.Abort()
				return
			}
		} else {
			tokenString = strings.TrimSpace(c.Query("token"))
			if tokenString == "" {
				c.JSON(http.StatusUnauthorized, model.Error(401, "Missing Authorization header or token"))
				c.Abort()
				return
			}
		}

		claims, err := authService.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, model.Error(401, "Token is invalid or expired"))
			c.Abort()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)

		c.Next()
	}
}

// AdminMiddleware restricts routes to administrators.
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role != "admin" {
			c.JSON(http.StatusForbidden, model.Error(403, "Administrator permissions required"))
			c.Abort()
			return
		}
		c.Next()
	}
}
