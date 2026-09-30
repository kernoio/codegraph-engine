package v1

// Cited from go-gitea/gitea routers/api/v1/api.go @ 812191c0f9283ecf469b1655a7c31c2f86dccf20.
// Nested m.Group callbacks reuse one router; Combo shares a pattern;
// addProjectRoutes is called from inside a group and must inherit that prefix.
func Routes() *web.Router {
	m := web.NewRouter()

	m.Group("", func() {
		m.Get("/version", misc.Version)
		m.Get("/licenses", misc.ListLicenseTemplates)
	})

	m.Group("/repos", func() {
		m.Get("/search", repo.Search)
		m.Group("/{username}/{reponame}", func() {
			m.Combo("").Get(reqAnyRepoReader(), repo.Get).
				Delete(repo.Delete).
				Patch(repo.Edit)
			m.Group("/transfer", func() {
				m.Post("/accept", repo.AcceptTransfer)
				m.Post("/reject", repo.RejectTransfer)
			})
			m.Methods("HEAD,GET", "/{ball_type:tarball|zipball|bundle}/*", repo.DownloadArchive)
		})
	})

	m.Group("/user", func() {
		m.Group("/projects", func() {
			addProjectRoutes(m)
		})
	})

	m.Group("/orgs/{org}", func() {
		m.Group("/projects", func() {
			addProjectRoutes(m)
		})
	})

	m.Get("/repos/{username}/{reponame}/actions/artifacts/{artifact_id}/zip/raw", repo.DownloadArtifactRaw)
	return m
}

func addProjectRoutes(m *web.Router) {
	m.Get("", shared.ListProjects)
	m.Group("/{id}", func() {
		m.Get("", shared.GetProject)
		m.Get("/columns", shared.ListProjectColumns)
	})
}
