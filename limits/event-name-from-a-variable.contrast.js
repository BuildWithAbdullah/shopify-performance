const marker = document.querySelector('.scroll-marker');

function onScroll() {
  marker.dataset.seen = 'yes';
}

window.addEventListener('scroll', onScroll, false);
