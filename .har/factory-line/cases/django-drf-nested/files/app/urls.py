from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from app.views import UserAPI, health, ping

router = DefaultRouter()
router.register(r'users', UserAPI)

urlpatterns = [
    path('health/', health),
    re_path(r'^nested/', include([
        path('ping/', ping),
    ])),
    path('', include(router.urls)),
]
