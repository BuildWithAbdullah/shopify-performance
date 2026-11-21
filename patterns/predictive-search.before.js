const field = document.querySelector('#search-field');
const panel = document.querySelector('#search-results');

field.addEventListener('input', (event) => {
  fetch('/search/suggest?q=' + encodeURIComponent(event.target.value))
    .then((response) => response.text())
    .then((html) => {
      panel.innerHTML = html;
    });
});
