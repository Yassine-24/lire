from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("accounts/login/", auth_views.LoginView.as_view(template_name="registration/login.html"), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("accounts/register/", views.register, name="register"),
    path("", views.today, name="today"),
    path("library/", views.library, name="library"),
    path("books/add/", views.book_add, name="book-add"),
    path("books/<uuid:book_id>/", views.book_detail, name="book-detail"),
    path("books/<uuid:book_id>/edit/", views.book_edit, name="book-edit"),
    path("books/<uuid:book_id>/progress/", views.book_progress, name="book-progress"),
    path("books/<uuid:book_id>/shelf/", views.book_status, name="book-status"),
    path("books/<uuid:book_id>/delete/", views.book_delete, name="book-delete"),
    path("sessions/start/", views.session_start, name="session-start"),
    path("sessions/<uuid:session_id>/pause/", views.session_pause, name="session-pause"),
    path("sessions/<uuid:session_id>/resume/", views.session_resume, name="session-resume"),
    path("sessions/<uuid:session_id>/finish/", views.session_finish, name="session-finish"),
    path("sessions/<uuid:session_id>/correct/", views.session_correct, name="session-correct"),
    path("stats/", views.stats, name="stats"),
    path("catalog/search/", views.catalog_search, name="catalog-search"),
    path("import/goodreads/", views.goodreads_import, name="goodreads-import"),
    path("import/goodreads/<uuid:draft_id>/", views.goodreads_preview, name="goodreads-preview"),
    path("profile/", views.profile, name="profile"),
    path("profile/edit/", views.profile_edit, name="profile-edit"),
    path("profile/delete/", views.account_delete, name="account-delete"),
    path("backup/", views.backup_page, name="backup"),
    path("backup/export/", views.backup_export, name="backup-export"),
    path("backup/restore/", views.backup_restore, name="backup-restore"),
]
