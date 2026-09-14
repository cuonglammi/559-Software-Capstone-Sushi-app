"""Run with RUN_BROWSER_TESTS=1 python manage.py test ordering.test_browser."""

import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from django.db import connections
from unittest import skipUnless
from django.contrib.staticfiles.testing import StaticLiveServerTestCase
from django.core.management import call_command
from playwright.sync_api import sync_playwright, expect
from .models import TableSession, Order


@skipUnless(
    os.getenv("RUN_BROWSER_TESTS") == "1",
    "Set RUN_BROWSER_TESTS=1 to run browser tests",
)
class BrowserWorkflowTests(StaticLiveServerTestCase):
    def setUp(self):
        os.environ["DEMO_STAFF_PASSWORD"] = "BrowserTest1!"
        call_command("seed_demo", verbosity=0)
        self.playwright = sync_playwright().start()
        self.addCleanup(self.playwright.stop)
        self.browser = self.playwright.chromium.launch()
        self.addCleanup(self.browser.close)

    def db(self, operation):
        # Playwright owns an event loop on this thread; keep ORM work on a separate thread.
        def run():
            try:
                return operation()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(run).result()

    def login(self, role):
        context = self.browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.goto(self.live_server_url + "/login/")
        page.get_by_label("Username:").fill(role + "01")
        page.get_by_label("Password:", exact=True).fill("BrowserTest1!")
        page.get_by_role("button", name="Sign in", exact=True).click()
        expect(page.get_by_role("heading", level=1)).to_be_visible()
        return page

    def assert_layout(self, page):
        self.assertTrue(
            page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
            "Horizontal overflow",
        )
        # Decorative login artwork is intentionally hidden at mobile widths.
        for img in page.locator("img:visible").all():
            img.scroll_into_view_if_needed()
            expect(img).to_be_visible()
            page.wait_for_function(
                "(src) => Array.from(document.images).filter(i => i.src === src).every(i => i.complete && i.naturalWidth > 0)",
                arg=img.get_attribute("src")
                if img.get_attribute("src").startswith("http")
                else self.live_server_url + img.get_attribute("src"),
            )
        page.evaluate("window.scrollTo(0, 0)")

    def test_server_customer_kitchen_and_closed_session(self):
        server = self.login("server")
        server.get_by_role("link", name="+ Start table session").click()
        server.get_by_label("Table:", exact=True).select_option(
            label="Table 12 · 4 seats"
        )
        server.get_by_label("Number of guests").fill("2")
        server.get_by_role("button", name="Open table", exact=True).click()
        expect(
            server.get_by_role("heading", name="Table 12", exact=True)
        ).to_be_visible()
        dining = self.db(lambda: TableSession.objects.get(table__number=12))
        kitchen = self.login("kitchen")
        expect(kitchen.get_by_text("All caught up.")).to_be_visible()
        customer = self.browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        customer.on("pageerror", lambda error: errors.append(str(error)))
        menu_url = self.live_server_url + f"/table/{dining.access_token}/"
        customer.goto(menu_url)
        customer.get_by_label("Search the menu").fill("california")
        customer.get_by_role("button", name="Apply filters").click()
        expect(
            customer.get_by_role("heading", name="California Roll", exact=True)
        ).to_be_visible()
        customer.get_by_label("Quantity", exact=True).fill("2")
        customer.get_by_label("Special requests").fill("<script>alert(1)</script>")
        customer.get_by_role("button", name="Add California Roll to cart").click()
        customer.get_by_role("link", name="Cart (2)", exact=True).click()
        expect(customer.get_by_text("$17.98", exact=True).first).to_be_visible()
        customer.get_by_label("Quantity").fill("3")
        customer.get_by_role("button", name="Update item").click()
        expect(customer.get_by_text("$26.97", exact=True).first).to_be_visible()
        customer.get_by_role("button", name="Send order to kitchen").click()
        expect(
            customer.get_by_role("heading", name="Your order is in!")
        ).to_be_visible()
        order = self.db(lambda: Order.objects.get(session=dining))
        expect(
            kitchen.get_by_role(
                "button", name=f"Start preparing order #{order.pk}", exact=True
            )
        ).to_be_visible(timeout=12000)
        kitchen.get_by_role(
            "button", name=f"Start preparing order #{order.pk}", exact=True
        ).click()
        kitchen.get_by_role(
            "button", name=f"Complete order #{order.pk}", exact=True
        ).click()
        expect(kitchen.get_by_text("Ready to serve")).to_be_visible()
        server.reload()
        server.get_by_role("button", name="Close table session").click()
        customer.goto(menu_url)
        expect(
            customer.get_by_text("This table session has ended.", exact=False)
        ).to_be_visible()
        self.assertEqual(
            customer.get_by_role("button", name="Add California Roll to cart").count(),
            0,
        )
        self.assertEqual(errors, [])
        self.db(order.refresh_from_db)
        self.assertEqual(order.status, "completed")

    def test_responsive_login_menu_cart_and_profile(self):
        server = self.login("server")
        from .models import RestaurantTable, Staff

        dining = self.db(
            lambda: TableSession.objects.create(
                table=RestaurantTable.objects.get(number=12),
                server=Staff.objects.get(username="server01"),
                customers=2,
                ayce=True,
            )
        )
        public = self.browser.new_page()
        for width, height in [(320, 700), (768, 1024), (1024, 768)]:
            for path in [
                "/login/",
                f"/table/{dining.access_token}/",
                f"/table/{dining.access_token}/cart/",
            ]:
                with self.subTest(width=width, path=path):
                    public.set_viewport_size({"width": width, "height": height})
                    public.goto(self.live_server_url + path)
                    self.assert_layout(public)
        public.set_viewport_size({"width": 640, "height": 900})
        public.goto(self.live_server_url + f"/table/{dining.access_token}/")
        public.evaluate("document.documentElement.style.fontSize = '200%'")
        self.assert_layout(public)
        expect(public.get_by_role("button", name="Apply filters")).to_be_visible()
        server.goto(self.live_server_url + "/profile/")
        server.set_viewport_size({"width": 320, "height": 700})
        self.assert_layout(server)
        server.get_by_label("Full name").fill("Alex Updated")
        server.get_by_role("button", name="Save profile").click()
        expect(server.get_by_text("Your profile has been updated.")).to_be_visible()
        target = os.getenv("BROWSER_SCREENSHOT_DIR")
        if target:
            Path(target).mkdir(parents=True, exist_ok=True)
            public.evaluate("document.documentElement.style.fontSize = '100%'")
            public.set_viewport_size({"width": 390, "height": 844})
            public.screenshot(
                path=str(Path(target) / "customer-mobile.png"), full_page=True
            )
            public.set_viewport_size({"width": 1280, "height": 900})
            public.goto(self.live_server_url + "/login/")
            public.screenshot(
                path=str(Path(target) / "staff-login.png"), full_page=True
            )
