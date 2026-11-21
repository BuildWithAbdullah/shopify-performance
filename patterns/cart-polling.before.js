const badge = document.querySelector('[data-cart-count]');

function refreshCart() {
  fetch('/cart.js')
    .then((response) => response.json())
    .then((cart) => {
      badge.textContent = String(cart.item_count);
    });
}

setInterval(refreshCart, 5000);
