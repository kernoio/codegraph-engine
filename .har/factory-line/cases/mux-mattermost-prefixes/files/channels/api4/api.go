package api4

import "net/http"

// Cited from mattermost/mattermost server/channels/api4/api.go.
// The struct comment is the full path; the PathPrefix assignment is only the
// last segment and must not replace the comment.
type Routes struct {
	Users *mux.Router // 'api/v4/users'
	User  *mux.Router // 'api/v4/users/{user_id:[A-Za-z0-9]+}'
}

func Init(srv *Server) {
	api.BaseRoutes.Users = api.BaseRoutes.ApiRoot.PathPrefix("/users").Subrouter()
	api.BaseRoutes.User = api.BaseRoutes.ApiRoot.PathPrefix("/users/{user_id:[A-Za-z0-9]+}").Subrouter()
}

const APIURLSuffix = "/api/v4"

func InitChain(srv *Server) {
	api.BaseRoutes.ChainRoot = srv.Router.PathPrefix(APIURLSuffix).Subrouter()
	api.BaseRoutes.ChainTeams = api.BaseRoutes.ChainRoot.PathPrefix("/teams").Subrouter()
	api.BaseRoutes.ChainTeams.Handle("", api.APIHandler(getTeams)).Methods(http.MethodGet)
}

func getTeams(w http.ResponseWriter, r *http.Request) {}
