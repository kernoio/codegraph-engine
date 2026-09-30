package routers

import "example.com/app/application/constants"

func Init(r *gin.Engine) {
	v4 := r.Group(constants.APIPrefix)
	v4.GET("/site", siteInfo)

	auth := r.Group("/answer/api/v1")
	register(auth)
}

func setup(r *gin.Engine, base string) {
	v1 := r.Group(base + "/api/v1")
	v1.GET("/users", listUsers)
	admin := v1.Group("/admin")
	admin.GET("/stats", stats)
}

func register(r *gin.RouterGroup) {
	r.GET("/user/info", userInfo)
}

func siteInfo()  {}
func listUsers() {}
func stats()     {}
func userInfo()  {}
