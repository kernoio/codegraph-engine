require 'sinatra'
require 'sinatra/namespace'

class API < Sinatra::Base
  configure do
    register Sinatra::Namespace
  end

  namespace '/api' do
    namespace '/v1' do
      get '/pizzerias' do
        content_type :json
        '[]'
      end

      get '/pizzerias/:id' do
        content_type :json
        '{}'
      end

      get '/properties/search' do
        content_type :json
        '[]'
      end
    end
  end
end
