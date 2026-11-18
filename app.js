const assetBase = new URL('./assets/', document.currentScript.src);
const assetURL = (file) => new URL(file, assetBase).href;

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.querySelector('.journey-menu');
const navigation = document.querySelector('#navigation');
const details = document.querySelector('#detail');
const forward = document.querySelector('.actions [data-forward]');
const film = document.querySelector('#film');
const player = film?.querySelector('video');
const progress = film?.querySelector('progress');
let nextURL;
let playbackTimer;
let leaving = false;
let wheelTotal = 0;
let lastWheel = 0;
let touchStart;

function toggleMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('menu-open', open);
}

menu.addEventListener('click', () => toggleMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    toggleMenu(false);
    menu.focus();
  }
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) toggleMenu(false);
});

if (details) {
  const trigger = document.querySelector('[data-detail]');
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    details.showModal();
  });
  details.querySelector('[data-close]').addEventListener('click', () => details.close());
  details.addEventListener('close', () => trigger.focus());
  if (location.hash === '#detail') details.showModal();
}

function finish() {
  if (!nextURL || leaving) return;
  leaving = true;
  clearTimeout(playbackTimer);
  player.pause();
  location.assign(nextURL);
}

function advance(target = forward) {
  if (!target || nextURL || leaving || document.querySelector('dialog[open]')) return;
  nextURL = target.href;
  if (!player || motion.matches || navigator.connection?.saveData) {
    location.assign(nextURL);
    return;
  }
  film.showModal();
  player.src = document.body.dataset.video;
  playbackTimer = setTimeout(finish, 7000);
  player.play().catch(finish);
}

if (film) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.href !== forward.href || event.defaultPrevented ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    advance(link);
  });

  player.addEventListener('playing', () => clearTimeout(playbackTimer));
  player.addEventListener('waiting', () => {
    if (!nextURL || leaving) return;
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(finish, 5500);
  });
  player.addEventListener('timeupdate', () => {
    progress.value = player.duration ? player.currentTime / player.duration : 0;
  });
  player.addEventListener('ended', finish);
  player.addEventListener('error', finish);
  film.querySelector('.film-skip').addEventListener('click', finish);
  film.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  motion.addEventListener('change', () => {
    if (motion.matches) finish();
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(playbackTimer);
    player.pause();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    nextURL = undefined;
    leaving = false;
    wheelTotal = 0;
    progress.value = 0;
    if (film.open) film.close();
    player.removeAttribute('src');
    player.load();
  });

  function canAdvance() {
    const scroller = document.scrollingElement;
    return !nextURL && !document.querySelector('dialog[open]') &&
      menu.getAttribute('aria-expanded') !== 'true' &&
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 4;
  }

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.deltaY <= 0 || Math.abs(event.deltaX) > event.deltaY || !canAdvance()) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheel > 280) wheelTotal = 0;
    lastWheel = now;
    wheelTotal += event.deltaY * (event.deltaMode ? 20 : 1);
    if (wheelTotal >= 28) advance();
  }, { passive: false });

  window.addEventListener('touchstart', (event) => {
    const point = event.touches[0];
    touchStart = event.touches.length === 1 && canAdvance() &&
      !event.target.closest('a,button,input,dialog') ? { x: point.clientX, y: point.clientY } : null;
  }, { passive: true });
  window.addEventListener('touchend', (event) => {
    if (!touchStart || !canAdvance()) return;
    const point = event.changedTouches[0];
    const movement = touchStart.y - point.clientY;
    if (movement > 42 && movement > Math.abs(touchStart.x - point.clientX)) advance();
    touchStart = null;
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'PageDown', ' '].includes(event.key) ||
        event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.target.closest('a,button,input,[contenteditable]') || !canAdvance()) return;
    event.preventDefault();
    advance();
  });
}

if (document.querySelector('#plan')) {
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
