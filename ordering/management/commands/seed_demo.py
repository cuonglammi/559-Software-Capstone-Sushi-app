import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from ordering.models import Staff, RestaurantTable, MenuCategory, MenuItem


class Command(BaseCommand):
    help = "Create sample tables, menu, and staff accounts. Requires an explicit password; never resets existing accounts."

    def handle(self, *args, **options):
        password = os.getenv("DEMO_STAFF_PASSWORD")
        if not password:
            raise CommandError(
                "Set DEMO_STAFF_PASSWORD to a strong password before seeding."
            )
        validate_password(password)
        for username, role, name in [
            ("server01", "server", "Alex Nguyen"),
            ("kitchen01", "kitchen", "Jamie Tran"),
        ]:
            if not Staff.objects.filter(username=username).exists():
                Staff.objects.create_user(
                    username=username, password=password, role=role, full_name=name
                )
        for number, capacity in [(3, 4), (5, 2), (8, 4), (12, 4), (15, 6)]:
            RestaurantTable.objects.get_or_create(
                number=number, defaults={"capacity": capacity}
            )
        for category, name, description, price, image in [
            (
                "Appetizers",
                "Edamame",
                "Steamed young soybeans with a light sprinkle of sea salt.",
                "4.50",
                "edamame",
            ),
            (
                "Appetizers",
                "Miso Soup",
                "Warm dashi broth with tofu, wakame, and green onion.",
                "3.50",
                "soup",
            ),
            (
                "Nigiri",
                "Salmon Nigiri",
                "Fresh salmon over hand-pressed sushi rice. Two pieces.",
                "5.99",
                "nigiri",
            ),
            (
                "Nigiri",
                "Tuna Nigiri",
                "Tender tuna over seasoned rice. Two pieces.",
                "6.50",
                "nigiri",
            ),
            (
                "Rolls",
                "California Roll",
                "Crab, cucumber, and avocado wrapped in rice and nori.",
                "8.99",
                "roll",
            ),
            (
                "Rolls",
                "Avocado Roll",
                "Creamy avocado, sesame seeds, and seasoned sushi rice.",
                "6.50",
                "roll",
            ),
            (
                "Beverages",
                "Green Tea",
                "Freshly brewed Japanese green tea, served hot.",
                "2.50",
                "tea",
            ),
            (
                "Beverages",
                "Sparkling Water",
                "Chilled sparkling mineral water.",
                "3.00",
                "tea",
            ),
        ]:
            group, _ = MenuCategory.objects.get_or_create(name=category)
            MenuItem.objects.get_or_create(
                name=name,
                defaults={
                    "category": group,
                    "description": description,
                    "price": price,
                    "illustration": image,
                },
            )
        self.stdout.write(
            self.style.SUCCESS(
                "Demo data ready. Existing accounts and menu records were preserved."
            )
        )
