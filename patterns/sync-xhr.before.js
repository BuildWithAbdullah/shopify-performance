export function loadRecommendations(productId) {
  const request = new XMLHttpRequest();
  request.open('GET', '/recommendations/products?product_id=' + productId, false);
  request.send(null);
  document.write(request.responseText);
}
