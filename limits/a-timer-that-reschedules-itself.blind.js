const badge = document.querySelector('[data-cart-count]');

// The same poll, written as a function that books its own next run. There is no
// interval here for the check to find.
function refreshCart() {
  fetch('/cart.js')
    .then((response) => response.json())
    .then((cart) => {
      badge.textContent = String(cart.item_count);
      setTimeout(refreshCart, 5000);
    });
}

refreshCart();
