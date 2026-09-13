import hashlib
import logging
import time
import uuid
from datetime import timedelta
from functools import wraps
from django.contrib import messages
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import F
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST
from .forms import CartItemForm, ProfileForm, SessionForm
from .models import LoginAttempt, MenuCategory, MenuItem, Order, Staff, TableSession
from .services import cart_rows, close_session, find_menu, submit_order, transition_order

logger = logging.getLogger(__name__)

def role_required(role):
    def decorator(view):
        @login_required
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.user.role != role:
                return render(request, 'ordering/error.html', {'message': 'Your staff role cannot access this page.'}, status=403)
            return view(request, *args, **kwargs)
        return wrapped
    return decorator

def sign_in(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    form = AuthenticationForm(request, data=request.POST or None)
    if request.method == 'POST':
        # Account-based throttling also works behind proxies without trusting client IP headers.
        key = hashlib.sha256(request.POST.get('username', '').strip().encode()).hexdigest()
        attempt, _ = LoginAttempt.objects.get_or_create(key=key, defaults={'window_started_at': timezone.now()})
        if timezone.now() - attempt.window_started_at >= timedelta(minutes=15):
            attempt.failures = 0
            attempt.window_started_at = timezone.now()
            attempt.save()
        if attempt.failures >= 5:
            form.add_error(None, 'Too many sign-in attempts. Please try again in 15 minutes.')
        elif form.is_valid():
            login(request, form.get_user())
            request.session['last_activity'] = time.time()
            attempt.delete()
            return redirect('dashboard')
        else:
            LoginAttempt.objects.filter(pk=attempt.pk).update(failures=F('failures') + 1)
    return render(request, 'ordering/login.html', {'form': form})

@require_POST
def sign_out(request):
    logout(request)
    return redirect('login')

@login_required
def dashboard(request):
    return redirect('kitchen' if request.user.role == Staff.Role.KITCHEN else 'tables')

@login_required
def profile(request):
    form = ProfileForm(request.POST or None, instance=request.user)
    if request.method == 'POST' and form.is_valid():
        form.save()
        messages.success(request, 'Your profile has been updated.')
        return redirect('profile')
    return render(request, 'ordering/profile.html', {'form': form})

@login_required
def password(request):
    form = PasswordChangeForm(request.user, request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        update_session_auth_hash(request, user)
        messages.success(request, 'Your password has been changed.')
        return redirect('profile')
    return render(request, 'ordering/form.html', {'form': form, 'title': 'Change password', 'button': 'Update password'})

@role_required(Staff.Role.SERVER)
def tables(request):
    sessions = TableSession.objects.filter(ended_at__isnull=True).select_related('table', 'server').prefetch_related('orders__items')
    return render(request, 'ordering/tables.html', {'sessions': sessions, 'active_count': sessions.count(),
        'open_count': Order.objects.filter(status__in=['pending', 'in_progress']).count()})

@role_required(Staff.Role.SERVER)
def new_session(request):
    form = SessionForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        dining = form.save(commit=False)
        dining.server = request.user
        try:
            dining.save()
        except IntegrityError:
            form.add_error('table', 'This table was just opened by another server. Choose another table.')
        else:
            messages.success(request, f'Table {dining.table.number} is ready. Open the customer menu link on the table device.')
            return redirect('tables')
    return render(request, 'ordering/form.html', {'form': form, 'title': 'Start a table session', 'button': 'Open table'})

@role_required(Staff.Role.SERVER)
@require_POST
def end_session(request, pk):
    get_object_or_404(TableSession, pk=pk)
    try:
        close_session(pk)
        messages.success(request, 'Table session closed. The customer link no longer accepts orders.')
    except ValidationError as exc:
        messages.error(request, exc.messages[0])
    return redirect('tables')

@role_required(Staff.Role.KITCHEN)
def kitchen(request):
    orders = Order.objects.exclude(status='cancelled').filter(session__ended_at__isnull=True).select_related('session__table').prefetch_related('items')
    return render(request, 'ordering/kitchen.html', {'orders': orders})

@role_required(Staff.Role.KITCHEN)
@require_POST
def advance_order(request, pk):
    get_object_or_404(Order, pk=pk)
    try:
        transition_order(pk, request.POST.get('status'))
        messages.success(request, f'Order #{pk} updated.')
    except ValidationError as exc:
        messages.error(request, exc.messages[0])
    return redirect('kitchen')

@login_required
def queue_data(request):
    orders = Order.objects.filter(session__ended_at__isnull=True).select_related('session__table')
    return JsonResponse({'orders': [{'id': o.pk, 'table': o.session.table.number, 'status': o.status} for o in orders]})

def dining_session(token):
    return get_object_or_404(TableSession.objects.select_related('table'), access_token=token)

def cart_key(dining):
    return f'cart_{dining.pk}'

def customer_context(request, dining):
    cart = request.session.get(cart_key(dining), {})
    return {'dining': dining, 'cart_count': sum(i['quantity'] for i in cart.values())}

def menu(request, token):
    dining = dining_session(token)
    context = customer_context(request, dining)
    context.update({'items': find_menu(request.GET.get('search', ''), request.GET.get('category', ''), request.GET.get('sort', 'name')),
        'categories': MenuCategory.objects.all()})
    return render(request, 'ordering/menu.html', context)

@require_POST
def add_item(request, token, pk):
    dining = dining_session(token)
    item = get_object_or_404(MenuItem, pk=pk)
    form = CartItemForm(request.POST)
    if dining.ended_at:
        messages.error(request, 'This table session has ended. Please ask your server for help.')
    elif not item.available:
        messages.error(request, 'This item is currently unavailable.')
    elif form.is_valid():
        cart = request.session.get(cart_key(dining), {})
        quantity = form.cleaned_data['quantity'] + cart.get(str(pk), {}).get('quantity', 0)
        if quantity > 10:
            messages.error(request, 'You can order up to 10 of each item per order. Edit the quantity in your cart.')
        elif len(cart) >= 100 and str(pk) not in cart:
            messages.error(request, 'Your cart is full. Submit this order before adding more items.')
        else:
            cart[str(pk)] = {'quantity': quantity, 'notes': form.cleaned_data['notes']}
            request.session[cart_key(dining)] = cart
            messages.success(request, f'{item.name} added to your cart.')
    else:
        messages.error(request, 'Use a quantity from 1 to 10 and notes up to 500 characters.')
    return redirect('menu', token=token)

def cart(request, token):
    dining = dining_session(token)
    rows, total = cart_rows(request.session.get(cart_key(dining), {}), dining)
    key = f'submission_{dining.pk}'
    if key not in request.session:
        request.session[key] = str(uuid.uuid4())
    context = customer_context(request, dining)
    context.update({'rows': rows, 'total': total, 'submission_key': request.session[key]})
    return render(request, 'ordering/cart.html', context)

@require_POST
def edit_cart(request, token, pk):
    dining = dining_session(token)
    current = request.session.get(cart_key(dining), {})
    if str(pk) not in current:
        messages.error(request, 'This item is no longer in your cart.')
    elif request.POST.get('action') == 'remove':
        del current[str(pk)]
    else:
        form = CartItemForm(request.POST)
        if form.is_valid():
            current[str(pk)] = form.cleaned_data
        else:
            messages.error(request, 'Use a quantity from 1 to 10 and notes up to 500 characters.')
    request.session[cart_key(dining)] = current
    return redirect('cart', token=token)

@require_POST
def checkout(request, token):
    dining = dining_session(token)
    expected = request.session.get(f'submission_{dining.pk}')
    submitted = request.POST.get('submission_key')
    # A retry of the last successful POST returns its confirmation without adding an order.
    last = request.session.get(f'last_order_{dining.pk}', {})
    if last.get('key') == submitted and submitted:
        return redirect('confirmation', token=token, pk=last['id'])
    if not expected or expected != submitted:
        messages.error(request, 'Your cart changed. Review it and submit again.')
        return redirect('cart', token=token)
    try:
        order = submit_order(dining.pk, request.session.get(cart_key(dining), {}), uuid.UUID(submitted))
    except ValidationError as exc:
        messages.error(request, exc.messages[0])
        return redirect('cart', token=token)
    except Exception:
        logger.exception('Order submission failed for table session %s', dining.pk)
        messages.error(request, 'Unable to submit order. Your cart is saved; please try again.')
        return redirect('cart', token=token)
    request.session[cart_key(dining)] = {}
    request.session[f'submission_{dining.pk}'] = str(uuid.uuid4())
    request.session[f'last_order_{dining.pk}'] = {'key': submitted, 'id': order.pk}
    return redirect('confirmation', token=token, pk=order.pk)

def confirmation(request, token, pk):
    dining = dining_session(token)
    order = get_object_or_404(Order.objects.prefetch_related('items'), pk=pk, session=dining)
    context = customer_context(request, dining)
    context['order'] = order
    return render(request, 'ordering/confirmation.html', context)

def error_404(request, exception):
    return render(request, 'ordering/error.html', {'message': 'We could not find that page. Please check your table link or ask a server.'}, status=404)

def error_500(request):
    return render(request, 'ordering/error.html', {'message': 'Something went wrong. Please try again in a moment.'}, status=500)

def csrf_failure(request, reason=''):
    return render(request, 'ordering/error.html', {'message': 'Your form has expired. Refresh the page and try again.'}, status=403)
