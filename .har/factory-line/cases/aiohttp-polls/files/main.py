from aiohttp import web
from aiohttpdemo_polls.routes import setup_routes


def init():
    app = web.Application()
    setup_routes(app)
    return app


if __name__ == "__main__":
    web.run_app(init())
