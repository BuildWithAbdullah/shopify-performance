const EVENTS = { scroll: 'scroll', resize: 'resize' };
const marker = document.querySelector('.scroll-marker');

function onScroll() {
  marker.dataset.seen = 'yes';
}

window.addEventListener(EVENTS.scroll, onScroll, false);
