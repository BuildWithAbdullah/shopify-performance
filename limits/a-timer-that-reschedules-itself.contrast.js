const badge = document.querySelector('[data-cart-count]');

setInterval(() => {
  fetch('/cart.js')
    .then((response) => response.json())
    .then((cart) => {
      badge.textContent = String(cart.item_count);
    });
}, 5000);
