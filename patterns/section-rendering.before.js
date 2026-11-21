export async function refreshCartDrawer() {
  const response = await fetch(window.location.pathname);
  const text = await response.text();
  const parsed = new DOMParser().parseFromString(text, 'text/html');
  const fresh = parsed.querySelector('#cart-drawer');
  document.querySelector('#cart-drawer').innerHTML = fresh.innerHTML;
}
