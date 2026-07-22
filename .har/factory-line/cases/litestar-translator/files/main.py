from litestar import Litestar

from server.api.v4.translator import TranslatorController

app = Litestar(route_handlers=[TranslatorController])
