package server

// Cited from apache/answer internal/base/server/http.go: the group prefix is
// a concatenation, and the routes live in a function the group is passed to.
func routes(r *gin.Engine) {
	authV1 := r.Group(uiConf.APIBaseURL + "/answer/api/v1")
	answerRouter.RegisterAnswerAPIRouter(authV1)
}
