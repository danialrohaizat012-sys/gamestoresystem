/* Arcadia POS — brand system: pixel-art logo marks, uploaded logos, wordmark, favicon */
(function () {
  const App = (window.App = window.App || {});
  const B = (App.brand = {});

  /* 16×16 pixel icons. '#' = main pixel, '*' = highlight pixel (second brand colour). */
  B.ICONS = {
    anchor: [
      '................',
      '.......##.......',
      '......#..#......',
      '......#..#......',
      '.......##.......',
      '....########....',
      '.......##.......',
      '.......##.......',
      '.......##.......',
      '.##....##....##.',
      '.###...##...###.',
      '..##...##...##..',
      '...###.##.###...',
      '....########....',
      '......####......',
      '..*..........*..',
    ],
    gamepad: [
      '................',
      '................',
      '................',
      '...##########...',
      '..############..',
      '.###.######.###.',
      '.##...####*#*##.',
      '.###.######.###.',
      '.##############.',
      '.######..######.',
      '.#####....#####.',
      '..###......###..',
      '................',
      '................',
      '................',
      '................',
    ],
    ghost: [
      '................',
      '................',
      '.....######.....',
      '....########....',
      '...##########...',
      '..############..',
      '..##..####..##..',
      '..#*..####*.##..',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '..##.##..##.##..',
      '..#...#..#...#..',
      '................',
      '................',
    ],
    crown: [
      '................',
      '................',
      '................',
      '..*....**....*..',
      '..#....##....#..',
      '..##..####..##..',
      '..###.####.###..',
      '..############..',
      '..############..',
      '..###*####*###..',
      '..############..',
      '..############..',
      '................',
      '................',
      '................',
      '................',
    ],
    rocket: [
      '.......##.......',
      '......####......',
      '.....######.....',
      '.....##..##.....',
      '.....##..##.....',
      '.....######.....',
      '.....######.....',
      '....########....',
      '...##########...',
      '...###.##.###...',
      '...##..##..##...',
      '.......**.......',
      '......*..*......',
      '.......**.......',
      '................',
      '................',
    ],
  };

  const S = () => App.store.settings();
  let uid = 0;

  /* Pixel mark as an SVG string (gradient tile + white pixels) */
  B.pixelSvg = (icon = 'anchor', a1 = '#7c5cff', a2 = '#22d3ee', { tile = true } = {}) => {
    const rows = B.ICONS[icon] || B.ICONS.anchor;
    const id = `bg${++uid}`;
    let px = '';
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '#') px += `<rect x="${x + 4}" y="${y + 4}" width="1.02" height="1.02" fill="#fff"/>`;
      else if (c === '*') px += `<rect x="${x + 4}" y="${y + 4}" width="1.02" height="1.02" fill="${a2}"/>`;
    }));
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      ${tile ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <rect width="24" height="24" rx="6" fill="url(#${id})" shape-rendering="geometricPrecision"/>
      <rect width="24" height="12" rx="6" fill="url(#${id}s)" shape-rendering="geometricPrecision"/>` : ''}
      <g ${tile ? 'filter="drop-shadow(0 .4px 0 rgba(0,0,0,.25))"' : ''}>${px}</g></svg>`;
  };

  /* Brand mark used everywhere (sidebar, login, receipts, favicon) */
  B.mark = (cls = '', s = S()) => {
    if (s.logo_mode === 'image' && s.logo_image) return `<span class="brand-mark img ${cls}"><img src="${s.logo_image}" alt=""></span>`;
    if (s.logo_mode === 'letters') return `<span class="brand-mark letters ${cls}" style="--a1:${s.accent};--a2:${s.accent2 || s.accent}">${App.utils.esc(s.logo_text || App.utils.initials(s.store_name))}</span>`;
    return `<span class="brand-mark ${cls}">${B.pixelSvg(s.logo_icon || 'anchor', s.accent, s.accent2 || '#22d3ee')}</span>`;
  };

  /* Wordmark: store name in display type + pixel-font caption */
  B.wordmark = (s = S(), cls = '') => {
    const e = App.utils.esc;
    const words = String(s.store_name || 'Game Store').trim().split(/\s+/);
    const last = words.length > 1 ? words.pop() : '';
    return `<span class="wordmark ${cls}"><b>${e(words.join(' '))}</b>${last ? `<i>${e(last)}</i>` : ''}</span>`;
  };

  B.favicon = (s = S()) => {
    let href;
    if (s.logo_mode === 'image' && s.logo_image) href = s.logo_image;
    else href = 'data:image/svg+xml,' + encodeURIComponent(s.logo_mode === 'letters'
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${s.accent}"/><text x="12" y="16" font-family="Arial" font-weight="800" font-size="10" fill="#fff" text-anchor="middle">${(s.logo_text || 'GS').slice(0, 2)}</text></svg>`
      : B.pixelSvg(s.logo_icon || 'anchor', s.accent, s.accent2 || '#22d3ee'));
    let link = document.querySelector('link[rel=icon]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = href;
  };

  /* Shrink an uploaded logo to a 256px PNG data URL so it fits in storage */
  B.readLogo = (file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
})();
