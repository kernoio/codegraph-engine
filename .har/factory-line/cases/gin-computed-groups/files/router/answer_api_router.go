package router

func RegisterAnswerAPIRouter(r *gin.RouterGroup) {
	r.GET("/siteinfo", getSiteInfo)
}

func getSiteInfo() {}
