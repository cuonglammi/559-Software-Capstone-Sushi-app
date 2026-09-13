from django import forms
from .models import Staff, TableSession, RestaurantTable

class ProfileForm(forms.ModelForm):
    class Meta:
        model = Staff
        fields = ['full_name']

class SessionForm(forms.ModelForm):
    class Meta:
        model = TableSession
        fields = ['table', 'customers', 'ayce']
        labels = {'customers': 'Number of guests', 'ayce': 'All you can eat (AYCE)'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        occupied = TableSession.objects.filter(ended_at__isnull=True).values('table_id')
        self.fields['table'].queryset = RestaurantTable.objects.exclude(pk__in=occupied)
    def clean(self):
        data = super().clean()
        table, customers = data.get('table'), data.get('customers')
        if table and customers and customers > table.capacity:
            self.add_error('customers', f'This table seats up to {table.capacity} guests.')
        return data

class CartItemForm(forms.Form):
    quantity = forms.IntegerField(min_value=1, max_value=10, initial=1)
    notes = forms.CharField(max_length=500, required=False)
