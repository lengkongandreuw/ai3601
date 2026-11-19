const assetBase = new URL('./assets/', document.currentScript.src);
const assetURL = (file) => new URL(file, assetBase).href;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const sceneCache = new Map();
const sceneKey = (url) => new URL(url).pathname.replace(/index\.html$/, '');
const chapterPaths = new Set([...document.querySelectorAll('.chapter-nav a')].map((link) => sceneKey(link.href)));
let displayed = location.href;
let pending = null;

let lastWheel = 0;
let wheelTotal = 0;
let touchStart = null;

function setMenu(open) {
  document.querySelector('.journey-menu').setAttribute('aria-expanded', String(open));
  document.querySelector('.journey-nav').classList.toggle('menu-open', open);
}

function setupScene() {
  const detail = document.querySelector('#detail');
  if (detail) {
    let opener;
    for (const trigger of document.querySelectorAll('[data-detail]')) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        opener = trigger;
        detail.showModal();
      });
    }
    detail.querySelector('[data-close]').addEventListener('click', () => detail.close());
    detail.addEventListener('close', () => opener?.focus());
    if (location.hash === '#detail') detail.showModal();
  }
  setupPlans();
  const next = forwardLink();
  if (next && /^https?:$/.test(location.protocol) && !navigator.connection?.saveData) {
    window.setTimeout(() => {
      if (next.isConnected) void prepare(next.href).catch(() => {});
    }, 250);
  }
}

function forwardLink() {
  return document.querySelector('.actions [data-forward]');
}

function getPage(url) {
  return fetch(url, { signal: AbortSignal.timeout(8000) }).then(async (response) => {
    if (!response.ok) throw new Error('Halaman tidak tersedia');
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!html.querySelector('main.scene') || !html.querySelector('.journey-header')) throw new Error('Halaman tidak sesuai');
    return html;
  });
}

function prepare(url) {
  const address = new URL(url);
  address.hash = '';
  const key = address.href;
  if (!sceneCache.has(key)) {
    const prepared = getPage(key).then(async (page) => {
      const picture = page.querySelector('.scene-picture');
      const source = [...picture.querySelectorAll('source')].find((item) => matchMedia(item.media || 'all').matches);
      const preload = new Image();
      preload.src = new URL(source?.getAttribute('srcset') || picture.querySelector('img').getAttribute('src'), key).href;
      await Promise.race([preload.decode().catch(() => {}), new Promise((res) => setTimeout(res, 1200))]);
      return page;
    }).catch((error) => {
      sceneCache.delete(key);
      throw error;
    });
    sceneCache.set(key, prepared);
  }
  return sceneCache.get(key);
}

function cloneForPage(node, url) {
  const copy = document.importNode(node, true);
  for (const element of [copy, ...copy.querySelectorAll('[href],[src],[srcset],[poster]')]) {
    for (const attr of ['href', 'src', 'srcset', 'poster']) {
      const value = element.getAttribute(attr);
      if (value && !value.startsWith('#')) element.setAttribute(attr, new URL(value, url).href);
    }
  }
  return copy;
}

function replaceScene(page, url, outgoingFilm, fromPop) {
  const currentMain = document.querySelector('main');
  const currentHeader = document.querySelector('.journey-header');
  const header = cloneForPage(page.querySelector('.journey-header'), url);
  const main = cloneForPage(page.querySelector('main.scene'), url);
  const dialogs = [...page.querySelectorAll('body > dialog')].map((node) => cloneForPage(node, url));
  if (!fromPop) history.pushState(null, '', url);
  displayed = url;
  document.title = page.title;
  document.body.className = page.body.className;
  const video = page.body.dataset.video;
  if (video) document.body.dataset.video = new URL(video, url).href;
  else delete document.body.dataset.video;
  for (const dialog of document.querySelectorAll('body > dialog')) {
    if (dialog !== outgoingFilm) dialog.remove();
  }
  currentHeader.replaceWith(header);
  currentMain.replaceWith(main);
  document.body.append(...dialogs);
  window.scrollTo(0, 0);
  document.body.classList.add(outgoingFilm ? 'from-film' : 'scene-arrival');
  setupScene();
  if (!outgoingFilm) main.querySelector('h1').focus({ preventScroll: true });
  return main;
}

async function finishNavigation(job) {
  if (job !== pending || job.finishing) return;
  job.finishing = true;
  clearTimeout(job.timeout);
  job.cleanup?.();
  job.player?.pause();
  try {
    const page = await job.prepared;
    if (!page) throw new Error('Navigasi dokumen diperlukan');
    if (job !== pending) return;
    const main = replaceScene(page, job.url, job.film, job.fromPop);
    if (job.film) {
      job.film.classList.add('film-leaving');
      await job.film.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 540, easing: 'cubic-bezier(.27,.5,.34,1)', fill: 'forwards'
      }).finished.catch(() => {});
      job.film.remove();
      main.querySelector('h1').focus({ preventScroll: true });
    }
  } catch {
    if (job !== pending) return;
    if (job.fromPop) location.reload();
    else location.assign(job.url);
  } finally {
    if (job === pending) pending = null;
  }
}

function startNavigation(url, withFilm = false, fromPop = false) {

  if (pending) {
    if (!fromPop) return;
    clearTimeout(pending.timeout);
    pending.cleanup?.();
    pending.player?.pause();
    pending.film?.remove();
  }
  const job = { url, fromPop, prepared: /^https?:$/.test(location.protocol) ? prepare(url).catch(() => null) : Promise.resolve(null) };
  pending = job;
  const film = withFilm && !motion.matches && !navigator.connection?.saveData ? document.querySelector('#film') : null;
  if (!film) {
    void finishNavigation(job);
    return;
  }
  const player = film.querySelector('video');
  const progress = film.querySelector('progress');
  const ending = film.querySelector('.film-end-frame');
  const controls = new AbortController();
  const options = { signal: controls.signal };
  job.film = film;
  job.player = player;
  job.cleanup = () => controls.abort();
  // Keep the final frame in the top layer while the next scene paints below it.
  const finish = () => void finishNavigation(job);
  const stalled = () => {
    clearTimeout(job.timeout);
    job.timeout = setTimeout(finish, 5200);
  };
  player.addEventListener('playing', () => {
    clearTimeout(job.timeout);
    film.classList.add('film-playing');
  }, options);
  player.addEventListener('waiting', stalled, options);
  player.addEventListener('ended', finish, options);
  player.addEventListener('error', finish, options);
  player.addEventListener('timeupdate', () => {
    progress.value = player.duration ? player.currentTime / player.duration : 0;
    if (ending?.complete && ending.naturalWidth && player.duration - player.currentTime <= .78) {
      film.classList.add('show-end-frame');
    }
  }, options);
  film.querySelector('.film-skip').addEventListener('click', finish, options);
  film.addEventListener('cancel', (event) => { event.preventDefault(); finish(); }, options);
  motion.addEventListener('change', () => { if (motion.matches) finish(); }, options);
  film.showModal();
  player.src = document.body.dataset.video;
  stalled();
  player.play().catch(finish);
}

document.addEventListener('click', (event) => {
  if (event.target.closest('.journey-menu')) {
    setMenu(document.querySelector('.journey-menu').getAttribute('aria-expanded') !== 'true');
    return;
  }
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
  const target = new URL(link.href);
  if (target.origin !== location.origin || !chapterPaths.has(sceneKey(target))) return;
  if (target.hash || sceneKey(target) === sceneKey(displayed)) return;
  const next = forwardLink();
  event.preventDefault();
  startNavigation(target.href, Boolean(next && sceneKey(target) === sceneKey(next.href)));
});

window.addEventListener('popstate', () => {
  if (sceneKey(displayed) !== sceneKey(location.href)) startNavigation(location.href, false, true);
});

function canAdvance() {
  const scroller = document.scrollingElement;
  return forwardLink() && !pending && !document.querySelector('dialog[open]') &&
    document.querySelector('.journey-menu').getAttribute('aria-expanded') !== 'true' &&
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 4;
}

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.deltaY <= 0 || Math.abs(event.deltaX) > event.deltaY || !canAdvance()) return;
  event.preventDefault();
  const now = performance.now();
  if (now - lastWheel > 280) wheelTotal = 0;
  lastWheel = now;
  wheelTotal += event.deltaY * (event.deltaMode ? 20 : 1);
  if (wheelTotal >= 28) {
    wheelTotal = 0;
    startNavigation(forwardLink().href, true);
  }
}, { passive: false });

window.addEventListener('touchstart', (event) => {
  const point = event.touches[0];
  touchStart = event.touches.length === 1 && canAdvance() &&
    !event.target.closest('a,button,input,dialog') ? { x: point.clientX, y: point.clientY } : null;
}, { passive: true });
window.addEventListener('touchend', (event) => {
  if (!touchStart) return;
  const start = touchStart;
  touchStart = null;
  if (!canAdvance()) return;
  const point = event.changedTouches[0];
  const movement = start.y - point.clientY;
  if (movement > 42 && movement > Math.abs(start.x - point.clientX)) startNavigation(forwardLink().href, true);
}, { passive: true });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.querySelector('.journey-menu').getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    document.querySelector('.journey-menu').focus();
    return;
  }
  if (!['ArrowDown', 'PageDown', ' '].includes(event.key) || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target.closest('a,button,input,[contenteditable]') || !canAdvance()) return;
  event.preventDefault();
  startNavigation(forwardLink().href, true);
});

document.body.classList.add('scene-arrival');
setupScene();
function setupPlans() {
  if (!document.querySelector('#plan')) return;
  const gallery = [
    { file: 'lorraine', caption: 'Ilustrasi deretan fasad Lorraine' },
    { file: 'facade', caption: 'Ilustrasi fasad dan balkon Lorraine' },
    { file: 'official-facade', caption: 'Tampak depan tipe Lorraine dari situs resmi' },
    { file: 'rear', caption: 'Ilustrasi sisi belakang Lorraine dan jalur hijau' },
  ];
  const galleryImage = document.querySelector('#gallery-image');
  const galleryCaption = document.querySelector('#gallery-caption');
  const galleryCount = document.querySelector('#gallery-count');
  let galleryIndex = 0;
  for (const button of document.querySelectorAll('[data-gallery-step]')) {
    button.addEventListener('click', () => {
      galleryIndex = (galleryIndex + Number(button.dataset.galleryStep) + gallery.length) % gallery.length;
      const { file, caption } = gallery[galleryIndex];
      galleryImage.src = assetURL(file + '.webp');
      galleryImage.alt = caption;
      galleryCaption.textContent = caption;
      galleryCount.textContent = String(galleryIndex + 1).padStart(2, '0') + ' / ' + String(gallery.length).padStart(2,'0');
    });
  }
  const plan = document.querySelector('#plan');
  const planImage = document.querySelector('#plan-image');
  const planTitle = document.querySelector('#plan-title');
  const planDescription = document.querySelector('#plan-description');
  const floorControls = document.querySelector('#floor-controls');
  const floorButtons = [...document.querySelectorAll('[data-floor]')];
  const zoomButton = document.querySelector('#zoom');
  const zoomArea = planImage.parentElement;
  let planTrigger = null;
  let planType = null;
  const plans = {
    standard: { title: 'Denah Type A Standard 10 × 20', url: assetURL('standard-plan.webp') },
    corner: { title: 'Denah Type A Corner 10 × 23', url: assetURL('corner-plan.webp') },
  };
  function setZoom(zoomed) {
    zoomArea.classList.toggle('zoomed', zoomed);
    zoomArea.tabIndex = zoomed ? 0 : -1;
    zoomArea.setAttribute('aria-label', 'Gambar denah');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.lastChild.textContent = zoomed ? ' Kembalikan ukuran' : ' Perbesar denah';
    zoomArea.scrollTo(0, 0);
  }
  function showFloor(floor) {
    planImage.src = assetURL('illustration-' + floor + '.webp');
    planImage.alt = 'Ilustrasi denah 3D lantai ' + floor;
    floorButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.floor === String(floor))));
    setZoom(false);
  }
  function openPlan(trigger, type = null) {
    planImage.hidden = false;
    zoomButton.hidden = false;
    planTrigger = trigger;
    planType = type;
    floorControls.hidden = Boolean(type);
    if (type) {
      const detail = plans[type];
      planTitle.textContent = detail.title;
      planDescription.textContent = 'Lantai 1 di kiri, lantai 2 di kanan. Denah dari halaman resmi Lorraine.';
      planImage.alt = detail.title;
      planImage.src = detail.url;
      setZoom(false);
    } else {
      planTitle.textContent = 'Ilustrasi denah 3D';
      planDescription.textContent = 'Visualisasi tata ruang. Detail tipe tersedia pada denah resmi Lorraine.';
      showFloor(1);
    }
    plan.showModal();
  }
  document.querySelector('#illustration-open').addEventListener('click', (event) => openPlan(event.currentTarget));
  for (const link of document.querySelectorAll('[data-unit][data-plan]')) {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openPlan(link, link.dataset.unit);
    });
  }
  planImage.addEventListener('error', () => {
    if (!planType) return;
    planImage.hidden = true;
    zoomButton.hidden = true;
    planDescription.textContent = 'Gambar gagal dimuat. Buka detail Lorraine melalui tautan di bawah.';
  });
  floorButtons.forEach((button) => button.addEventListener('click', () => showFloor(button.dataset.floor)));
  zoomButton.addEventListener('click', () => setZoom(!zoomArea.classList.contains('zoomed')));
  plan.querySelector('[data-close]').addEventListener('click', () => plan.close());
  plan.addEventListener('close', () => {
    setZoom(false);
    planTrigger?.focus();
  });
  plan.addEventListener('click', (event) => {
    if (event.target === plan) {
      const { top, bottom, left, right } = plan.getBoundingClientRect();
      if (event.clientY < top || event.clientY > bottom || event.clientX < left || event.clientX > right) plan.close();
    }
  });
}
