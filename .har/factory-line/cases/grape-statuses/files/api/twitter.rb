module Twitter
  class API < Grape::API
    version 'v1', using: :header, vendor: 'twitter'
    format :json
    prefix :api

    helpers do
      def current_user
        nil
      end
    end

    resource :statuses do
      desc 'Return a public timeline.'
      get :public_timeline do
        []
      end

      desc 'Return a personal timeline.'
      get :home_timeline do
        []
      end

      desc 'Return a status.'
      params do
        requires :id, type: Integer
      end
      route_param :id do
        get do
          {}
        end
      end

      desc 'Create a status.'
      post do
        {}
      end

      desc 'Update a status.'
      put ':id' do
        {}
      end

      desc 'Delete a status.'
      delete ':id' do
        {}
      end
    end
  end
end
