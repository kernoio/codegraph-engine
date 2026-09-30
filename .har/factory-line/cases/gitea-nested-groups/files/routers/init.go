package routers

import (
	apiv1 "example.com/gitea/routers/api/v1"
)

// Cited from go-gitea/gitea routers/init.go @ 812191c0f9283ecf469b1655a7c31c2f86dccf20.
// The API router is mounted at /api/v1; nested groups live in apiv1.Routes.
func NormalRoutes() *web.Router {
	r := web.NewRouter()
	r.Mount("/api/v1", apiv1.Routes())
	r.Mount("/", web_routers.Routes())
	return r
}
