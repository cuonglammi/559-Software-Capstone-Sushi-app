from django.core.exceptions import ValidationError


class PasswordPolicy:
    def validate(self, password, user=None):
        if not (
            len(password) >= 8
            and any(c.isupper() for c in password)
            and any(c.islower() for c in password)
            and any(c.isdigit() for c in password)
            and any(not c.isalnum() and not c.isspace() for c in password)
        ):
            raise ValidationError(self.get_help_text(), code="password_policy")

    def get_help_text(self):
        return "Use at least 8 characters, including uppercase, lowercase, a number, and a special character."
