from django.contrib import admin
from django.urls import path
from ordering import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.dashboard, name="dashboard"),
    path("login/", views.sign_in, name="login"),
    path("logout/", views.sign_out, name="logout"),
    path("profile/", views.profile, name="profile"),
    path("profile/password/", views.password, name="password"),
    path("tables/", views.tables, name="tables"),
    path("tables/new/", views.new_session, name="new_session"),
    path("tables/<int:pk>/close/", views.end_session, name="end_session"),
    path("kitchen/", views.kitchen, name="kitchen"),
    path("kitchen/<int:pk>/status/", views.advance_order, name="advance_order"),
    path("api/queue/", views.queue_data, name="queue_data"),
    path("table/<uuid:token>/", views.menu, name="menu"),
    path("table/<uuid:token>/add/<int:pk>/", views.add_item, name="add_item"),
    path("table/<uuid:token>/cart/", views.cart, name="cart"),
    path("table/<uuid:token>/cart/<int:pk>/", views.edit_cart, name="edit_cart"),
    path("table/<uuid:token>/checkout/", views.checkout, name="checkout"),
    path("table/<uuid:token>/order/<int:pk>/", views.confirmation, name="confirmation"),
]
handler404 = views.error_404
handler500 = views.error_500
