from sanic import Blueprint

api_bp = Blueprint('api_blueprint', url_prefix='api')


@api_bp.route("/owl_bd_novels/<name>")
async def owl_bd_novels(request, name):
    return None


@api_bp.route("/owl_novels_chapters", methods=['POST'])
async def owl_novels_chapters(request):
    return None


@api_bp.route("/owl_so_novels/<name>")
async def owl_so_novels(request, name):
    return None
