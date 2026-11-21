const header = document.querySelector('.header');
const banner = document.querySelector('.banner');

window.addEventListener('scroll', function () {
  header.style.transform = 'translateY(0)';
  const height = banner.offsetHeight;
  header.style.setProperty('--offset', height + 'px');
});

window.addEventListener('resize', function () {
  banner.style.width = window.innerWidth + 'px';
});
