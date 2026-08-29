/* 原创卡通伙伴：乐乐猫、贝贝熊、图图兔、阿鸭（经典卡通风格，原创设计） */
window.MASCOTS = (function () {
  function svg(inner) {
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }
  return {
    cat: svg(
      '<circle cx="60" cy="68" r="40" fill="#F9A825" stroke="#7A4A12" stroke-width="4"/>' +
      '<path d="M28 44L14 20l22 2z" fill="#F9A825" stroke="#7A4A12" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M92 44l14-24-22 2z" fill="#F9A825" stroke="#7A4A12" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M33 38l8 8M87 38l-8 8" stroke="#E8890C" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="46" cy="64" rx="6" ry="8" fill="#7A4A12"/><ellipse cx="74" cy="64" rx="6" ry="8" fill="#7A4A12"/>' +
      '<circle cx="48" cy="61" r="2.4" fill="#fff"/><circle cx="76" cy="61" r="2.4" fill="#fff"/>' +
      '<path d="M60 70l-7 8h14z" fill="#E8637A"/>' +
      '<path d="M60 78v6M60 84a7 7 0 0 0 7 7M60 91a13 13 0 0 0 13 13" stroke="#7A4A12" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M60 70c-14 0-22-8-24-14M60 70c14 0 22-8 24-14" stroke="#7A4A12" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="48" cy="102" r="6" fill="#FFD54F" stroke="#7A4A12" stroke-width="2.5"/>'
    ),
    bear: svg(
      '<circle cx="60" cy="68" r="40" fill="#C08A5A" stroke="#6B4526" stroke-width="4"/>' +
      '<circle cx="30" cy="42" r="13" fill="#C08A5A" stroke="#6B4526" stroke-width="4"/><circle cx="90" cy="42" r="13" fill="#C08A5A" stroke="#6B4526" stroke-width="4"/>' +
      '<circle cx="30" cy="42" r="6" fill="#E8B98A"/><circle cx="90" cy="42" r="6" fill="#E8B98A"/>' +
      '<ellipse cx="46" cy="66" rx="5.5" ry="7.5" fill="#3D2B1A"/><ellipse cx="74" cy="66" rx="5.5" ry="7.5" fill="#3D2B1A"/>' +
      '<circle cx="48" cy="63" r="2.2" fill="#fff"/><circle cx="76" cy="63" r="2.2" fill="#fff"/>' +
      '<ellipse cx="60" cy="78" rx="10" ry="7" fill="#E8B98A"/><path d="M60 71l-6 6h12z" fill="#3D2B1A"/>' +
      '<path d="M46 92c4 5 24 5 28 0" stroke="#3D2B1A" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M60 108l-14 12M60 108l14 12" stroke="#6B4526" stroke-width="4" stroke-linecap="round"/>'
    ),
    rabbit: svg(
      '<circle cx="60" cy="70" r="38" fill="#F8F4F0" stroke="#8D6E63" stroke-width="4"/>' +
      '<ellipse cx="42" cy="28" rx="9" ry="22" fill="#F8F4F0" stroke="#8D6E63" stroke-width="4" transform="rotate(-14 42 28)"/>' +
      '<ellipse cx="78" cy="28" rx="9" ry="22" fill="#F8F4F0" stroke="#8D6E63" stroke-width="4" transform="rotate(14 78 28)"/>' +
      '<ellipse cx="42" cy="28" rx="4" ry="14" fill="#F5A9C4" transform="rotate(-14 42 28)"/>' +
      '<ellipse cx="78" cy="28" rx="4" ry="14" fill="#F5A9C4" transform="rotate(14 78 28)"/>' +
      '<ellipse cx="46" cy="66" rx="5.5" ry="7.5" fill="#4E342E"/><ellipse cx="74" cy="66" rx="5.5" ry="7.5" fill="#4E342E"/>' +
      '<circle cx="48" cy="63" r="2.2" fill="#fff"/><circle cx="76" cy="63" r="2.2" fill="#fff"/>' +
      '<path d="M60 72l-6 6h12z" fill="#F08AAB"/>' +
      '<path d="M48 86c4 4 20 4 24 0" stroke="#4E342E" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="34" cy="88" r="6" fill="#F5A9C4" opacity="0.8"/><circle cx="86" cy="88" r="6" fill="#F5A9C4" opacity="0.8"/>' +
      '<path d="M60 108l-16 12M60 108l16 12" stroke="#8D6E63" stroke-width="4" stroke-linecap="round"/>'
    ),
    duck: svg(
      '<circle cx="60" cy="70" r="38" fill="#FFD54F" stroke="#B8860B" stroke-width="4"/>' +
      '<path d="M30 26c10-12 40-12 50 0-10 4-40 4-50 0z" fill="#FFD54F" stroke="#B8860B" stroke-width="4" stroke-linejoin="round"/>' +
      '<ellipse cx="46" cy="66" rx="5.5" ry="7.5" fill="#5D4037"/><ellipse cx="74" cy="66" rx="5.5" ry="7.5" fill="#5D4037"/>' +
      '<circle cx="48" cy="63" r="2.2" fill="#fff"/><circle cx="76" cy="63" r="2.2" fill="#fff"/>' +
      '<path d="M54 78h16c0 8-3 12-8 12s-8-4-8-12z" fill="#F59A2E" stroke="#B8860B" stroke-width="3"/>' +
      '<path d="M60 108l-14 12M60 108l14 12" stroke="#B8860B" stroke-width="4" stroke-linecap="round"/>'
    ),
  };
})();

window.Mascot = {
  el: null,
  bubble: null,
  shown: false,
  names: { cat: '乐乐猫', bear: '贝贝熊', rabbit: '图图兔', duck: '阿鸭' },
  ensure() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'mascot-popup';
    this.el.innerHTML = '<div class="mascot-avatar"></div><div class="mascot-bubble"></div>';
    document.body.appendChild(this.el);
    this.bubble = this.el.querySelector('.mascot-bubble');
  },
  show(key, text, ms) {
    this.ensure();
    this.el.querySelector('.mascot-avatar').innerHTML = window.MASCOTS[key];
    this.bubble.textContent = text;
    this.el.classList.add('show');
    this.shown = true;
    if (ms) {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.hide(), ms);
    }
  },
  hide() {
    if (this.el) this.el.classList.remove('show');
    this.shown = false;
  },
};
