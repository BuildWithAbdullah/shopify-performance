const variants = window.themeVariants || [];

for (let i = 0; i < variants.length; i += 1) {
  const node = document.querySelector('#variant-' + variants[i].id);
  if (node) node.textContent = variants[i].title;
}
