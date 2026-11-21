export async function loadRecommendations(productId, target) {
  const response = await fetch('/recommendations/products?product_id=' + productId);
  const html = await response.text();
  const holder = document.createElement('div');
  holder.innerHTML = html;
  target.replaceChildren(...holder.childNodes);
}
