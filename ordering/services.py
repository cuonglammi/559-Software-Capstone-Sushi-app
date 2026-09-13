from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .models import MenuItem, Order, OrderItem, TableSession

SORTS = {"name": "name", "priceAsc": "price", "priceDesc": "-price"}


def find_menu(search="", category="", sort="name"):
    items = MenuItem.objects.select_related("category")
    if search:
        items = items.filter(
            Q(name__icontains=search) | Q(description__icontains=search)
        )
    if category:
        items = items.filter(category__name=category)
    return items.order_by("category__name", SORTS.get(sort, "name"), "id")


def cart_rows(cart, table_session):
    items = {str(i.pk): i for i in MenuItem.objects.filter(pk__in=cart)}
    rows = []
    for key, value in cart.items():
        if key in items:
            item = items[key]
            price = Decimal("0") if table_session.ayce else item.price
            rows.append(
                {
                    "item": item,
                    "quantity": value["quantity"],
                    "notes": value["notes"],
                    "price": price,
                    "subtotal": price * value["quantity"],
                }
            )
    return rows, sum((r["subtotal"] for r in rows), Decimal("0"))


@transaction.atomic
def submit_order(session_id, cart, submission_key):
    dining = TableSession.objects.select_for_update().get(pk=session_id)
    existing = Order.objects.filter(
        submission_key=submission_key, session=dining
    ).first()
    if existing:
        return existing
    if dining.ended_at:
        raise ValidationError(
            "This table session has ended. Please ask your server for help."
        )
    if not cart:
        raise ValidationError("Add an item to your cart before submitting.")
    if len(cart) > 100:
        raise ValidationError("A cart may contain at most 100 different items.")
    for value in cart.values():
        if (
            type(value.get("quantity")) is not int
            or not 1 <= value["quantity"] <= 10
            or not isinstance(value.get("notes"), str)
            or len(value["notes"]) > 500
        ):
            raise ValidationError(
                "Check item quantities (1–10) and notes (up to 500 characters)."
            )
    rows, _ = cart_rows(cart, dining)
    if len(rows) != len(cart) or any(not r["item"].available for r in rows):
        raise ValidationError(
            "An item is no longer available. Remove it from your cart and try again."
        )
    for row in rows:
        if (
            type(row["quantity"]) is not int
            or not 1 <= row["quantity"] <= 10
            or len(row["notes"]) > 500
        ):
            raise ValidationError(
                "Check item quantities (1–10) and notes (up to 500 characters)."
            )
    order = Order.objects.create(session=dining, submission_key=submission_key)
    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                menu_item=r["item"],
                name=r["item"].name,
                quantity=r["quantity"],
                notes=r["notes"],
                unit_price=r["price"],
            )
            for r in rows
        ]
    )
    return order


@transaction.atomic
def transition_order(order_id, status):
    order = Order.objects.select_for_update().get(pk=order_id)
    next_status = {
        Order.Status.PENDING: Order.Status.IN_PROGRESS,
        Order.Status.IN_PROGRESS: Order.Status.COMPLETED,
    }
    if next_status.get(order.status) != status:
        raise ValidationError(
            "This order has changed. Refresh the queue and use the next available action."
        )
    order.status = status
    order.save(update_fields=["status"])
    order.items.update(preparation_status=status)
    return order


@transaction.atomic
def close_session(session_id):
    dining = TableSession.objects.select_for_update().get(pk=session_id)
    if dining.ended_at:
        return
    if dining.orders.filter(
        status__in=[Order.Status.PENDING, Order.Status.IN_PROGRESS]
    ).exists():
        raise ValidationError("Complete outstanding orders before closing this table.")
    dining.ended_at = timezone.now()
    dining.save(update_fields=["ended_at"])
