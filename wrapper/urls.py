from django.urls import path
from . import views

urlpatterns = [
    path("index/", views.index),
    path("", views.index),
    path('api/start_session/', views.start_session),
    path('api/stop_session/', views.stop_session, name='capture_website'),
    path('api/proxy_view/<str:session_id>/', views.proxy_view, name='proxy_view'),
    path('api/proxy_asset/', views.proxy_asset, name='proxy_asset'),
    path('api/list_wrappers/', views.list_wrappers, name='list_wrappers'),
    path('api/run_wrapper/', views.run_wrapper, name='run_wrapper'),
    path('api/delete_wrapper/', views.delete_wrapper, name='delete_wrapper'),
    
]
