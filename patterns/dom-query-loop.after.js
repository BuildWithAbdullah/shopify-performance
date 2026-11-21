const variants = window.themeVariants || [];
const byId = new Map();

document.querySelectorAll('[data-variant-id]').forEach((node) => {
  byId.set(node.dataset.variantId, node);
});

for (let i = 0; i < variants.length; i += 1) {
  const node = byId.get(String(variants[i].id));
  if (node) node.textContent = variants[i].title;
}
