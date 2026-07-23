package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/logger"
)

// SetupRoutes setup router api — cited from gofiber/recipes auth-jwt/router/router.go
func SetupRoutes(app *fiber.App) {
	api := app.Group("/api", logger.New())
	api.Get("/", Hello)

	auth := api.Group("/auth")
	auth.Post("/login", Login)
	auth.Post("/register", Register)
	auth.Post("/logout", Protected(), Logout)
	auth.Post("/refresh-token", RefreshToken)

	user := api.Group("/users")
	user.Get("/:id", Protected(), GetUser)
	user.Patch("/:id", Protected(), UpdateUser)
	user.Delete("/:id", Protected(), DeleteUser)

	product := api.Group("/products")
	product.Get("/", GetAllProducts)
	product.Get("/:id", GetProduct)
	product.Post("/", Protected(), CreateProduct)
	product.Delete("/:id", DeleteProduct)
}

func Hello(c fiber.Ctx) error             { return nil }
func Login(c fiber.Ctx) error             { return nil }
func Register(c fiber.Ctx) error          { return nil }
func Logout(c fiber.Ctx) error            { return nil }
func RefreshToken(c fiber.Ctx) error      { return nil }
func GetUser(c fiber.Ctx) error           { return nil }
func UpdateUser(c fiber.Ctx) error        { return nil }
func DeleteUser(c fiber.Ctx) error        { return nil }
func GetAllProducts(c fiber.Ctx) error    { return nil }
func GetProduct(c fiber.Ctx) error        { return nil }
func CreateProduct(c fiber.Ctx) error     { return nil }
func DeleteProduct(c fiber.Ctx) error     { return nil }
func Protected() fiber.Handler            { return func(c fiber.Ctx) error { return c.Next() } }
