const field = document.querySelector('#search-field');
const panel = document.querySelector('#search-results');

let timer = null;
let inFlight = null;

field.addEventListener('input', (event) => {
  const term = event.target.value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (inFlight) inFlight.abort();
    inFlight = new AbortController();
    fetch('/search/suggest?q=' + encodeURIComponent(term), { signal: inFlight.signal })
      .then((response) => response.text())
      .then((html) => {
        panel.innerHTML = html;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') throw error;
      });
  }, 250);
});
