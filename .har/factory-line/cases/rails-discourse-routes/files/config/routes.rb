# Trimmed from discourse/discourse config/routes.rb @ badad7b0456a628e578bc48b9f8c1259422b5d58
Rails.application.routes.draw do
  namespace :admin, constraints: StaffConstraint.new do
    get "" => "admin#index"
    resources :users, only: %i[index] do
      collection do
        get "list" => "users#index"
      end
      put "suspend"
    end
  end

  resources :session, id: RouteFormat.username, only: %i[create destroy]

  scope "/topics", username: RouteFormat.username do
    get "created-by/:username" => "list#topics_by"
  end

  %w[users u].each_with_index do |root_path, index|
    get "#{root_path}" => "users#index"
    resources :users, only: %i[create], path: root_path
    get "#{root_path}/trusted-session" => "users#trusted_session"
  end

  DiscoursePluginRegistry.admin_config_login_routes.each do |location|
    get "login-and-authentication/#{location}" => "site_settings#index"
  end
end
