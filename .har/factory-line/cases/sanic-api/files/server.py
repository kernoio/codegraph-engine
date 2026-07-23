from sanic import Sanic
from views.api_blueprint import api_bp

app = Sanic("owllook")
app.blueprint(api_bp)
