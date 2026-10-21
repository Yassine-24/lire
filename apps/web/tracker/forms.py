from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Book


class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=True)

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email", "password1", "password2")


class ProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ("username", "email")


class BookForm(forms.ModelForm):
    class Meta:
        model = Book
        fields = (
            "title",
            "author",
            "status",
            "page_count",
            "current_page",
            "isbn",
            "catalog_id",
            "cover_url",
            "published_year",
            "rating",
            "started_at",
            "finished_at",
            "notes",
        )
        widgets = {
            "notes": forms.Textarea(attrs={"rows": 4}),
            "catalog_id": forms.HiddenInput(),
            "started_at": forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"),
            "finished_at": forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"),
            "cover_url": forms.URLInput(attrs={"placeholder": "https://…"}),
            "page_count": forms.NumberInput(attrs={"min": 1}),
            "current_page": forms.NumberInput(attrs={"min": 0}),
            "rating": forms.Select(
                choices=[("", "No rating"), (1, "1 star"), (2, "2 stars"), (3, "3 stars"), (4, "4 stars"), (5, "5 stars")]
            ),
        }
        labels = {
            "page_count": "Total pages",
            "current_page": "Current page",
            "catalog_id": "Open Library ID",
            "cover_url": "Cover image URL",
            "published_year": "Publication year",
            "started_at": "Started",
            "finished_at": "Finished",
            "notes": "Private notes",
        }

    def clean_title(self):
        title = self.cleaned_data["title"].strip()
        if not title:
            raise forms.ValidationError("A title is needed to save this book.")
        return title

    def clean_author(self):
        return self.cleaned_data.get("author", "").strip()

    def clean_isbn(self):
        return self.cleaned_data.get("isbn", "").strip()

    def clean(self):
        cleaned = super().clean()
        page_count = cleaned.get("page_count")
        current_page = cleaned.get("current_page") or 0
        status = cleaned.get("status")
        if page_count and current_page > page_count:
            self.add_error("current_page", "Current page cannot be greater than total pages.")
        if status == Book.Status.FINISHED and page_count:
            cleaned["current_page"] = page_count
        started_at = cleaned.get("started_at")
        finished_at = cleaned.get("finished_at")
        if started_at and finished_at and finished_at < started_at:
            self.add_error("finished_at", "Finish date cannot be earlier than start date.")
        return cleaned


class ProgressForm(forms.Form):
    page_count = forms.IntegerField(min_value=1, max_value=2_147_483_647, required=False, label="Total pages")
    current_page = forms.IntegerField(min_value=0, max_value=2_147_483_647, label="Current page")

    def clean(self):
        cleaned = super().clean()
        page_count = cleaned.get("page_count")
        current_page = cleaned.get("current_page")
        if page_count and current_page is not None and current_page > page_count:
            self.add_error("current_page", "Current page cannot be greater than total pages.")
        return cleaned


class GoodreadsUploadForm(forms.Form):
    csv_file = forms.FileField(label="Goodreads CSV export")

    def clean_csv_file(self):
        uploaded = self.cleaned_data["csv_file"]
        if uploaded.size > 5 * 1024 * 1024:
            raise forms.ValidationError("Choose a CSV file under 5 MB.")
        if not uploaded.name.lower().endswith(".csv"):
            raise forms.ValidationError("Choose the CSV export from Goodreads.")
        return uploaded


class BackupRestoreForm(forms.Form):
    backup_file = forms.FileField(label="Lire JSON backup")

    def clean_backup_file(self):
        uploaded = self.cleaned_data["backup_file"]
        if uploaded.size > 10 * 1024 * 1024:
            raise forms.ValidationError("Choose a Lire backup under 10 MB.")
        if not uploaded.name.lower().endswith(".json"):
            raise forms.ValidationError("Choose a .json Lire backup.")
        return uploaded


class AccountDeleteForm(forms.Form):
    password = forms.CharField(
        label="Confirm your password",
        widget=forms.PasswordInput,
        strip=False,
    )


class SessionCorrectionForm(forms.Form):
    total_minutes = forms.IntegerField(min_value=0, max_value=10_000_000, label="Total minutes")
