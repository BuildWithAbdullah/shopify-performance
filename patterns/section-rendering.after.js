export async function refreshCartDrawer() {
  const response = await fetch('/?sections=cart-drawer');
  const sections = await response.json();
  document.querySelector('#cart-drawer').innerHTML = sections['cart-drawer'];
}
