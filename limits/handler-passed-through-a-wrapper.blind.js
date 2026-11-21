const field = document.querySelector('#search-field');
const panel = document.querySelector('#search-results');

function withLogging(handler) {
  return function (event) {
    handler(event);
  };
}

function onType(event) {
  fetch('/search/suggest?q=' + encodeURIComponent(event.target.value))
    .then((response) => response.text())
    .then((html) => {
      panel.innerHTML = html;
    });
}

field.addEventListener('input', withLogging(onType));
