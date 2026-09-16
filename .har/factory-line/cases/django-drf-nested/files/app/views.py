from rest_framework import viewsets


class BaseAPI(viewsets.ModelViewSet):
    queryset = []


class UserAPI(BaseAPI):
    queryset = []


def health(request):
    return None


def ping(request):
    return None
