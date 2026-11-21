const badge = document.querySelector('[data-cart-count]');
let inFlight = null;

function refreshCart() {
  if (inFlight) inFlight.abort();
  inFlight = new AbortController();
  return fetch('/cart.js', { signal: inFlight.signal })
    .then((response) => response.json())
    .then((cart) => {
      badge.textContent = String(cart.item_count);
    })
    .catch((error) => {
      if (error.name !== 'AbortError') throw error;
    });
}

document.addEventListener('cart:updated', refreshCart);
