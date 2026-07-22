# From https://github.com/falconry/falcon — examples/asgilook/asgilook/images.py
import falcon


class Images:
    async def on_get(self, req, resp):
        resp.media = []

    async def on_get_image(self, req, resp, image_id):
        raise falcon.HTTPNotFound

    async def on_post(self, req, resp):
        resp.status = falcon.HTTP_201


class Thumbnails:
    async def on_get(self, req, resp, image_id, width, height):
        resp.content_type = falcon.MEDIA_JPEG
