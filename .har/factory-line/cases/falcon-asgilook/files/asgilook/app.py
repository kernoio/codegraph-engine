# From https://github.com/falconry/falcon — examples/asgilook/asgilook/app.py
import falcon.asgi

from .images import Images
from .images import Thumbnails


def create_app():
    images = Images()
    thumbnails = Thumbnails()

    app = falcon.asgi.App()
    app.add_route('/images', images)
    app.add_route('/images/{image_id:uuid}.jpeg', images, suffix='image')
    app.add_route(
        '/thumbnails/{image_id:uuid}/{width:int}x{height:int}.jpeg', thumbnails
    )

    return app
