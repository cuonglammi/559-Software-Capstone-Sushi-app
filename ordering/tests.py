import time
import uuid
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from .forms import SessionForm
from .models import Staff, RestaurantTable, TableSession, MenuCategory, MenuItem, Order
from .services import (
    cart_rows,
    close_session,
    find_menu,
    submit_order,
    transition_order,
)
from .validators import PasswordPolicy


class WorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.server = Staff.objects.create_user(
            username="server01", password="TestPass1!", full_name="Alex", role="server"
        )
        cls.kitchen = Staff.objects.create_user(
            username="kitchen01",
            password="TestPass1!",
            full_name="Jamie",
            role="kitchen",
        )
        cls.table = RestaurantTable.objects.create(number=12, capacity=4)
        cls.dining = TableSession.objects.create(
            table=cls.table, server=cls.server, customers=2
        )
        category = MenuCategory.objects.create(name="Rolls")
        cls.roll = MenuItem.objects.create(
            category=category,
            name="California Roll",
            description="Crab and avocado",
            price="8.99",
        )
        cls.salmon = MenuItem.objects.create(
            category=category,
            name="Salmon Roll",
            description="Fresh salmon",
            price="5.99",
        )

    def cart_data(self):
        return {str(self.roll.pk): {"quantity": 2, "notes": "No wasabi"}}

    def test_password_policy(self):
        for weak in ["password", "Password1", "Password!", "Aa1!"]:
            with self.subTest(weak=weak), self.assertRaises(ValidationError):
                PasswordPolicy().validate(weak)
        PasswordPolicy().validate("P@ssword1")

    def test_login_and_role_authorization(self):
        self.assertEqual(self.client.get("/tables/").status_code, 302)
        self.client.post("/login/", {"username": "server01", "password": "wrong"})
        self.assertNotIn("_auth_user_id", self.client.session)
        self.client.post("/login/", {"username": "server01", "password": "TestPass1!"})
        self.assertEqual(self.client.get("/tables/").status_code, 200)
        self.assertEqual(self.client.get("/kitchen/").status_code, 403)
        self.client.force_login(self.kitchen)
        self.assertEqual(self.client.post("/tables/new/", {}).status_code, 403)

    def test_login_throttled_after_five_failures(self):
        for _ in range(5):
            self.client.post("/login/", {"username": "server01", "password": "wrong"})
        response = self.client.post(
            "/login/", {"username": "server01", "password": "TestPass1!"}
        )
        self.assertContains(response, "Too many sign-in attempts")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_idle_timeout_and_background_poll(self):
        self.client.force_login(self.kitchen)
        session = self.client.session
        last = time.time() - 60
        session["last_activity"] = last
        session.save()
        self.client.get("/api/queue/", HTTP_X_BACKGROUND_POLL="1")
        self.assertEqual(self.client.session["last_activity"], last)
        session = self.client.session
        session["last_activity"] = time.time() - 901
        session.save()
        self.assertEqual(
            self.client.get("/api/queue/", HTTP_X_BACKGROUND_POLL="1").status_code, 302
        )
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_profile_cannot_escalate_role(self):
        self.client.force_login(self.server)
        self.client.post(
            "/profile/",
            {"full_name": "Alex Nguyen", "role": "kitchen", "is_superuser": "true"},
        )
        self.server.refresh_from_db()
        self.assertEqual(self.server.full_name, "Alex Nguyen")
        self.assertEqual(self.server.role, "server")
        self.assertFalse(self.server.is_superuser)

    def test_password_change_and_hashing(self):
        self.client.force_login(self.server)
        data = {
            "old_password": "wrong",
            "new_password1": "NewPass1!",
            "new_password2": "NewPass1!",
        }
        self.assertEqual(self.client.post("/profile/password/", data).status_code, 200)
        data["old_password"] = "TestPass1!"
        self.assertEqual(self.client.post("/profile/password/", data).status_code, 302)
        self.server.refresh_from_db()
        self.assertTrue(check_password("NewPass1!", self.server.password))
        self.assertNotEqual(self.server.password, "NewPass1!")
        self.assertEqual(self.client.get("/profile/").status_code, 200)

    def test_capacity_and_duplicate_active_session(self):
        table = RestaurantTable.objects.create(number=5, capacity=2)
        self.assertFalse(SessionForm({"table": table.pk, "customers": 3}).is_valid())
        self.assertFalse(SessionForm({"table": table.pk, "customers": 0}).is_valid())
        with self.assertRaises(IntegrityError), transaction.atomic():
            TableSession.objects.create(
                table=self.table, server=self.server, customers=1
            )
        self.client.force_login(self.server)
        self.client.post(
            "/tables/new/",
            {
                "table": table.pk,
                "customers": 2,
                "ayce": "on",
                "server": self.kitchen.pk,
            },
        )
        created = TableSession.objects.get(table=table)
        self.assertEqual(created.server, self.server)
        self.assertTrue(created.ayce)

    def test_search_filter_sort_and_sql_injection(self):
        self.assertEqual(list(find_menu("salmon", "Rolls")), [self.salmon])
        self.assertEqual(list(find_menu("avocado")), [self.roll])
        self.assertEqual(list(find_menu(sort="priceAsc")), [self.salmon, self.roll])
        self.assertEqual(list(find_menu(sort="priceDesc")), [self.roll, self.salmon])
        self.assertEqual(find_menu("' OR 1=1 --").count(), 0)
        self.client.post(
            "/login/", {"username": "' OR 1=1 --", "password": "TestPass1!"}
        )
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_cart_total_ayce_and_quantity_bounds(self):
        _, total = cart_rows(self.cart_data(), self.dining)
        self.assertEqual(total, Decimal("17.98"))
        self.dining.ayce = True
        self.dining.save()
        order = submit_order(self.dining.pk, self.cart_data(), uuid.uuid4())
        self.assertEqual(order.total, Decimal("0"))
        for quantity in [0, 11, -1, 1.5, True]:
            with self.subTest(quantity=quantity), self.assertRaises(ValidationError):
                submit_order(
                    self.dining.pk,
                    {str(self.roll.pk): {"quantity": quantity, "notes": ""}},
                    uuid.uuid4(),
                )

    def test_price_snapshot_idempotency_and_transitions(self):
        key = uuid.uuid4()
        order = submit_order(self.dining.pk, self.cart_data(), key)
        self.assertEqual(
            submit_order(self.dining.pk, self.cart_data(), key).pk, order.pk
        )
        self.assertEqual(Order.objects.count(), 1)
        self.roll.price = Decimal("99")
        self.roll.save()
        self.assertEqual(order.total, Decimal("17.98"))
        with self.assertRaises(ValidationError):
            transition_order(order.pk, "completed")
        transition_order(order.pk, "in_progress")
        with self.assertRaises(ValidationError):
            transition_order(order.pk, "pending")
        transition_order(order.pk, "completed")
        self.assertEqual(order.items.get().preparation_status, "completed")

    def test_closure_and_unavailable_items(self):
        self.roll.available = False
        self.roll.save()
        with self.assertRaises(ValidationError):
            submit_order(self.dining.pk, self.cart_data(), uuid.uuid4())
        self.roll.available = True
        self.roll.save()
        order = submit_order(self.dining.pk, self.cart_data(), uuid.uuid4())
        with self.assertRaises(ValidationError):
            close_session(self.dining.pk)
        transition_order(order.pk, "in_progress")
        transition_order(order.pk, "completed")
        close_session(self.dining.pk)
        with self.assertRaises(ValidationError):
            submit_order(self.dining.pk, self.cart_data(), uuid.uuid4())

    def test_complete_customer_post_workflow_and_retry(self):
        token = self.dining.access_token
        self.client.post(
            reverse("add_item", args=[token, self.roll.pk]),
            {"quantity": 2, "notes": "<script>alert(1)</script>"},
        )
        cart = self.client.get(reverse("cart", args=[token]))
        self.assertContains(cart, "&lt;script&gt;")
        self.assertNotContains(cart, "<script>alert(1)</script>")
        key = self.client.session[f"submission_{self.dining.pk}"]
        response = self.client.post(
            reverse("checkout", args=[token]), {"submission_key": key}, follow=True
        )
        self.assertContains(response, "Your order is in!")
        self.client.post(reverse("checkout", args=[token]), {"submission_key": key})
        self.assertEqual(Order.objects.count(), 1)
        self.client.force_login(self.kitchen)
        self.assertContains(self.client.get("/kitchen/"), "&lt;script&gt;")

    def test_failed_checkout_preserves_cart(self):
        token = self.dining.access_token
        self.client.post(
            reverse("add_item", args=[token, self.roll.pk]),
            {"quantity": 1, "notes": ""},
        )
        self.client.get(reverse("cart", args=[token]))
        key = self.client.session[f"submission_{self.dining.pk}"]
        with (
            patch(
                "ordering.views.submit_order",
                side_effect=RuntimeError("private database detail"),
            ),
            self.assertLogs("ordering.views", level="ERROR"),
        ):
            response = self.client.post(
                reverse("checkout", args=[token]), {"submission_key": key}, follow=True
            )
        self.assertContains(response, "Unable to submit order")
        self.assertNotContains(response, "private database detail")
        self.assertTrue(self.client.session[f"cart_{self.dining.pk}"])

    def test_customer_links_are_scoped(self):
        other = TableSession.objects.create(
            table=RestaurantTable.objects.create(number=99, capacity=2),
            server=self.server,
            customers=1,
        )
        order = submit_order(self.dining.pk, self.cart_data(), uuid.uuid4())
        self.assertEqual(
            self.client.get(
                reverse("confirmation", args=[other.access_token, order.pk])
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(reverse("menu", args=[uuid.uuid4()])).status_code, 404
        )
        self.assertEqual(
            self.client.post("/kitchen/1/status/", {"status": "completed"}).status_code,
            302,
        )

    def test_csrf_and_security_headers(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(
            client.post(
                "/login/", {"username": "server01", "password": "TestPass1!"}
            ).status_code,
            403,
        )
        response = client.get("/login/")
        self.assertIn("script-src 'self'", response["Content-Security-Policy"])
        self.assertEqual(response["Referrer-Policy"], "same-origin")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Cache-Control"], "no-store")

    @override_settings(
        SECURE_SSL_REDIRECT=True, SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True
    )
    def test_https_and_cookie_flags(self):
        self.assertEqual(self.client.get("/login/").status_code, 301)
        response = self.client.post(
            "/login/", {"username": "server01", "password": "TestPass1!"}, secure=True
        )
        self.assertTrue(response.cookies["sessionid"]["secure"])
        self.assertTrue(response.cookies["sessionid"]["httponly"])
        self.assertEqual(response.cookies["sessionid"]["samesite"], "Lax")

    def test_cart_edit_remove_and_invalid_input(self):
        token = self.dining.access_token
        add = reverse("add_item", args=[token, self.roll.pk])
        edit = reverse("edit_cart", args=[token, self.roll.pk])
        self.client.post(add, {"quantity": 11})
        self.assertFalse(self.client.session.get(f"cart_{self.dining.pk}"))
        self.client.post(add, {"quantity": 2})
        self.client.post(
            edit, {"quantity": 3, "notes": "No sesame", "action": "update"}
        )
        self.assertContains(self.client.get(reverse("cart", args=[token])), "$26.97")
        self.client.post(edit, {"action": "remove"})
        self.assertFalse(self.client.session[f"cart_{self.dining.pk}"])
