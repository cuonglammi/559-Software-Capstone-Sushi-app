import uuid
from decimal import Decimal
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.core.validators import MinValueValidator, MaxValueValidator

class Staff(AbstractUser):
    class Role(models.TextChoices):
        SERVER = 'server', 'Server'
        KITCHEN = 'kitchen', 'Kitchen staff'
    full_name = models.CharField(max_length=100)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.SERVER)

class RestaurantTable(models.Model):
    number = models.PositiveIntegerField(unique=True, validators=[MinValueValidator(1)])
    capacity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    class Meta:
        ordering = ['number']
        constraints = [models.CheckConstraint(condition=Q(capacity__gte=1), name='table_capacity_positive')]
    def __str__(self):
        return f'Table {self.number} · {self.capacity} seats'

class TableSession(models.Model):
    table = models.ForeignKey(RestaurantTable, on_delete=models.PROTECT)
    server = models.ForeignKey(Staff, on_delete=models.PROTECT)
    customers = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    ayce = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    access_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    class Meta:
        ordering = ['table__number']
        constraints = [models.UniqueConstraint(fields=['table'], condition=Q(ended_at__isnull=True), name='one_active_session_per_table'),
                       models.CheckConstraint(condition=Q(customers__gte=1), name='session_customers_positive')]

class MenuCategory(models.Model):
    name = models.CharField(max_length=60, unique=True)
    class Meta:
        ordering = ['name']
    def __str__(self):
        return self.name

class MenuItem(models.Model):
    category = models.ForeignKey(MenuCategory, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    description = models.TextField(max_length=500)
    price = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    image_url = models.URLField(blank=True)
    illustration = models.CharField(max_length=12, default='roll', choices=[(x, x.title()) for x in ['roll', 'nigiri', 'edamame', 'soup', 'tea']])
    available = models.BooleanField(default=True)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(price__gte=0), name='menu_price_nonnegative')]
    def __str__(self):
        return self.name

class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'
    session = models.ForeignKey(TableSession, on_delete=models.PROTECT, related_name='orders')
    submitted_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    submission_key = models.UUIDField(unique=True, default=uuid.uuid4)
    class Meta:
        ordering = ['submitted_at']
    @property
    def total(self):
        return sum((i.unit_price * i.quantity for i in self.items.all()), Decimal('0'))

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    quantity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(10)])
    notes = models.CharField(max_length=500, blank=True)
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    preparation_status = models.CharField(max_length=15, choices=Order.Status.choices, default=Order.Status.PENDING)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(quantity__gte=1, quantity__lte=10), name='order_quantity_range'),
                       models.CheckConstraint(condition=Q(unit_price__gte=0), name='order_price_nonnegative')]

class LoginAttempt(models.Model):
    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    window_started_at = models.DateTimeField()
