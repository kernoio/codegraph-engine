/**
 * Rails route extraction — BE-3279.
 *
 * Fixtures are trimmed from real routes files:
 *   - discourse/discourse config/routes.rb @ badad7b (v2026.8.0)
 *   - mastodon/mastodon config/routes.rb @ v4.3.8
 */

import { describe, expect, it } from 'vitest';
import { railsResolver } from '../../src/plugins/rails/resolver';

function names(src: string, file = 'config/routes.rb'): string[] {
  const { nodes } = railsResolver.extract!(file, src);
  return nodes.map((n) => n.name).sort();
}

function refs(src: string, file = 'config/routes.rb'): string[] {
  const { references } = railsResolver.extract!(file, src);
  return references.map((r) => r.referenceName).sort();
}

describe('rails plugin (BE-3279)', () => {
  it('keeps explicit get/post controller#action routes', () => {
    expect(names(`get '/users', to: 'users#index'\n`)).toEqual(['GET /users']);
    expect(refs(`get '/users', to: 'users#index'\n`)).toEqual(['users#index']);
    expect(names(`post '/items' => 'items#create'\n`)).toEqual(['POST /items']);
    expect(refs(`post '/items' => 'items#create'\n`)).toEqual(['items#create']);
  });

  it('skips commented routes', () => {
    const src = `
# get '/fake', to: 'fake#index'
=begin
get '/also-fake', to: 'fake#show'
=end
get '/real', to: 'real#index'
`;
    expect(names(src)).toEqual(['GET /real']);
    expect(refs(src)).toEqual(['real#index']);
  });

  it('honours only: %i[...] and does not emit the other REST actions', () => {
    // discourse/discourse config/routes.rb — resources :session
    const src = `resources :session, id: RouteFormat.username, only: %i[create destroy] do\nend\n`;
    expect(names(src)).toEqual(['DELETE /session/:id', 'POST /session']);
    expect(refs(src)).toEqual(['session#create', 'session#destroy']);
  });

  it('honours only: [:sym], only: :sym, except:, and %i()', () => {
    expect(names(`resources :about, only: [:index]\n`)).toEqual(['GET /about']);
    expect(names(`resources :email, only: :index\n`)).toEqual(['GET /email']);
    expect(names(`resources :photos, except: [:destroy]\n`).filter((n) => n.startsWith('DELETE'))).toEqual([]);
    expect(names(`resources :posts, only: %i(index show)\n`)).toEqual([
      'GET /posts',
      'GET /posts/:id',
    ]);
  });

  it('uses the path: option instead of the resource name', () => {
    // mastodon config/routes.rb — resource :instance_actor, path: 'actor'
    const src = `resource :instance_actor, path: 'actor', only: [:show]\n`;
    expect(names(src)).toEqual(['GET /actor']);
    expect(refs(src)).toEqual(['instance_actors#show']);

    const emailLogs = `resources :email_logs, only: :index, path: "/email-logs"\n`;
    expect(names(emailLogs)).toEqual(['GET /email-logs']);
  });

  it('expands a literal %w loop into path: and #{interpolation}', () => {
    // discourse/discourse config/routes.rb — %w[users u].each_with_index
    const src = `
%w[users u].each_with_index do |root_path, index|
  get "#{root_path}" => "users#index"
  resources :users, only: %i[create], path: root_path do
    collection do
      get "check_username"
    end
  end
  get "#{root_path}/trusted-session" => "users#trusted_session"
  post "#{root_path}/confirm-session" => "users#confirm_session"
end
`;
    expect(names(src)).toEqual([
      'GET /u',
      'GET /u/check_username',
      'GET /u/trusted-session',
      'GET /users',
      'GET /users/check_username',
      'GET /users/trusted-session',
      'POST /u',
      'POST /u/confirm-session',
      'POST /users',
      'POST /users/confirm-session',
    ]);
    expect(refs(src)).toContain('users#trusted_session');
    expect(refs(src)).toContain('users#create');
    expect(names(src).some((n) => n.includes('#{'))).toBe(false);
  });

  it('omits a #{name} whose binding is not a literal list', () => {
    const src = `
DiscoursePluginRegistry.admin_config_login_routes.each do |location|
  get "login-and-authentication/#{location}" => "site_settings#index"
end
get "/real" => "site#index"
`;
    expect(names(src)).toEqual(['GET /real']);
  });

  it('composes scope and namespace prefixes', () => {
    // discourse config/routes.rb — scope "/topics" and namespace :admin
    const src = `
namespace :admin, constraints: StaffConstraint.new do
  get "" => "admin#index"
  resources :users, only: %i[index destroy] do
    collection do
      get "list" => "users#index"
    end
    put "suspend"
  end
  namespace :config do
    get "login-and-authentication" => "site_settings#index"
  end
end
scope "/topics", username: RouteFormat.username do
  get "created-by/:username" => "list#topics_by"
end
scope path: nil, constraints: { format: :xml } do
  resources :sitemap, only: [:index]
end
`;
    expect(names(src)).toEqual([
      'DELETE /admin/users/:id',
      'GET /admin',
      'GET /admin/config/login-and-authentication',
      'GET /admin/users',
      'GET /admin/users/list',
      'GET /sitemap',
      'GET /topics/created-by/:username',
      'PUT /admin/users/:user_id/suspend',
    ]);
    expect(refs(src)).toContain('admin/users#index');
    expect(refs(src)).toContain('admin/users#suspend');
    expect(refs(src)).toContain('admin/admin#index');
    expect(refs(src)).toContain('admin/config/site_settings#index');
    expect(refs(src)).toContain('list#topics_by');
  });

  it('nests resources and applies param: and module:', () => {
    // mastodon config/routes.rb — accounts path: 'users', param: :username
    const src = `
resources :accounts, path: 'users', only: [:show], param: :username do
  resources :statuses, only: [:show] do
    member do
      get :activity
    end
    resources :replies, only: [:index], module: :activitypub
  end
end
namespace :disputes do
  resources :strikes, only: [:show, :index] do
    resource :appeal, only: [:create]
  end
end
`;
    expect(names(src)).toEqual([
      'GET /disputes/strikes',
      'GET /disputes/strikes/:id',
      'GET /users/:account_username/statuses/:id',
      'GET /users/:account_username/statuses/:id/activity',
      'GET /users/:account_username/statuses/:status_id/replies',
      'GET /users/:username',
      'POST /disputes/strikes/:strike_id/appeal',
    ]);
    expect(refs(src)).toContain('activitypub/replies#index');
    expect(refs(src)).toContain('disputes/appeals#create');
    expect(refs(src)).toContain('accounts#show');
  });

  it('reads scope path: and a %w assignment each', () => {
    // mastodon config/routes.rb — scope path: '.well-known' and web_app_paths
    const src = `
scope path: '.well-known' do
  scope module: :well_known do
    get 'host-meta', to: 'host_meta#show'
  end
  get 'change-password', to: 'home#index'
end
web_app_paths = %w(
  /getting-started
  /keyboard-shortcuts
).freeze
web_app_paths.each do |path|
  get path, to: 'home#index'
end
%w[guidelines rules conduct].each do |guidelines_alias|
  get guidelines_alias => "static#show"
end
`;
    expect(names(src)).toEqual([
      'GET /.well-known/change-password',
      'GET /.well-known/host-meta',
      'GET /conduct',
      'GET /getting-started',
      'GET /guidelines',
      'GET /keyboard-shortcuts',
      'GET /rules',
    ]);
    expect(refs(src)).toContain('well_known/host_meta#show');
  });

  it('emits one route per match via: and a root', () => {
    const src = `
root 'home#index'
match '/', via: [:post, :put], to: 'application#raise_not_found'
match '/both', via: %i[get post], to: 'pages#both'
`;
    expect(names(src)).toEqual([
      'GET /',
      'GET /both',
      'POST /',
      'POST /both',
      'PUT /',
    ]);
  });

  it('keeps a multiline only: list and a path split across lines', () => {
    const src = `
resources :badges,
  only: %i[index create],
  constraints: AdminConstraint.new
resources :customize,
  path: "customize",
  only: %i[index] do
  collection do
    get "/themes" => "customize#themes"
  end
end
`;
    expect(names(src)).toEqual([
      'GET /badges',
      'GET /customize',
      'GET /customize/themes',
      'POST /badges',
    ]);
  });

  it('reads routes.append in a plugin file and ignores the surrounding code', () => {
    const src = `
# frozen_string_literal: true
after_initialize do
  get "/not-a-route" => "nope#index"
  Discourse::Application.routes.append do
    get "/plugins/example" => "example#index"
  end
end
`;
    expect(names(src, 'plugins/discourse-example/plugin.rb')).toEqual(['GET /plugins/example']);
  });

  it('does not fire detect() without a Rails marker', () => {
    const ctx = {
      readFile: () => "gem 'sinatra'\n",
      fileExists: () => false,
      getAllFiles: () => [],
      getNodesByName: () => [],
      getNodesInFile: () => [],
    };
    expect(railsResolver.detect(ctx as never)).toBe(false);
    expect(railsResolver.detect({
      ...ctx,
      readFile: (f: string) => (f === 'Gemfile' ? "gem 'rails'\n" : null),
    } as never)).toBe(true);
  });
});
