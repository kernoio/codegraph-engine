"""Trimmed from https://github.com/winstxnhdw/nllb-api — server/api/v4/translator.py"""

from litestar import Controller, Response, delete, get, post, put
from litestar.response.sse import ServerSentEvent
from litestar.status_codes import HTTP_200_OK, HTTP_204_NO_CONTENT


class TranslatorController(Controller):
    path = "/translator"

    @delete(sync_to_thread=True)
    def unload_model(self) -> Response[None]:
        return Response(content=None, status_code=HTTP_204_NO_CONTENT)

    @put(sync_to_thread=True)
    def load_model(self) -> Response[None]:
        return Response(content=None, status_code=HTTP_204_NO_CONTENT)

    @get("/tokens", cache=True, sync_to_thread=True)
    def tokens(self, text: str) -> dict:
        return {"length": len(text)}

    @get(cache=True, sync_to_thread=True)
    def translator_get(self, text: str) -> dict:
        return {"result": text}

    @post(status_code=HTTP_200_OK, sync_to_thread=True, deprecated=True)
    def translator_post(self, data: dict) -> dict:
        return {"result": data.get("text", "")}

    @get("/stream", sync_to_thread=True)
    def translator_stream(self, text: str) -> ServerSentEvent:
        return ServerSentEvent([text])
