from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Staff, RestaurantTable, MenuCategory, MenuItem, TableSession, Order, OrderItem

@admin.register(Staff)
class StaffAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Restaurant profile', {'fields': ('full_name', 'role')}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('Restaurant profile', {'fields': ('full_name', 'role')}),)

admin.site.register([RestaurantTable, MenuCategory, MenuItem])
# Operational records are read-only in admin so service invariants cannot be bypassed.
class HistoryAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False
admin.site.register([TableSession, Order, OrderItem], HistoryAdmin)
