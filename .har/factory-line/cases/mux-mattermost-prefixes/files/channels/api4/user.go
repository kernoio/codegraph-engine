package api4

import "net/http"

func InitUser(api *API) {
	api.BaseRoutes.Users.Handle("", api.APIHandler(createUser)).Methods(http.MethodPost)
	api.BaseRoutes.Users.Handle("/ids", api.APISessionRequired(getUsersByIds)).Methods(http.MethodPost)
	api.BaseRoutes.User.Handle("", api.APISessionRequired(getUser)).Methods(http.MethodGet)
}

func createUser(w http.ResponseWriter, r *http.Request)     {}
func getUsersByIds(w http.ResponseWriter, r *http.Request)  {}
func getUser(w http.ResponseWriter, r *http.Request)        {}
