const header = document.querySelector('.header');
const banner = document.querySelector('.banner');

window.addEventListener(
  'scroll',
  function () {
    const height = banner.offsetHeight;
    header.style.transform = 'translateY(0)';
    header.style.setProperty('--offset', height + 'px');
  },
  { passive: true }
);

let pending = false;
window.addEventListener('resize', function () {
  if (pending) return;
  pending = true;
  requestAnimationFrame(function () {
    pending = false;
    banner.style.width = window.innerWidth + 'px';
  });
});
