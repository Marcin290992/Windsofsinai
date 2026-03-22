import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
window.gsap = gsap;

let lenis;
let tickerFn = null;
let refreshFn = null;

ScrollTrigger.config({
  ignoreMobileResize: true,
  autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
});

function destroyLenis() {
  if (refreshFn) {
    ScrollTrigger.removeEventListener('refresh', refreshFn);
    refreshFn = null;
  }
  if (tickerFn) {
    gsap.ticker.remove(tickerFn);
    tickerFn = null;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
    window.lenis = null;
  }
}

function initLenis() {
  destroyLenis();

  const scrollWrapper = document.getElementById('scroll-wrapper');
  const scrollContent = document.getElementById('scroll-content');
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  lenis = new Lenis({
    wrapper: scrollWrapper || undefined,
    content: scrollContent || undefined,
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: !isTouch,
    infinite: false,
  });

  lenis.on('scroll', ScrollTrigger.update);

  tickerFn = (time) => { lenis?.raf(time * 1000); };
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);

  const scrollEl = scrollWrapper || document.body;
  ScrollTrigger.scrollerProxy(scrollEl, {
    scrollTop(value) {
      if (arguments.length) {
        lenis?.scrollTo(value, { immediate: true });
      }
      return scrollEl.scrollTop;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    },
    pinType: scrollWrapper ? 'transform' : (scrollEl.style.transform ? 'transform' : 'fixed'),
  });

  refreshFn = () => lenis?.resize();
  ScrollTrigger.addEventListener('refresh', refreshFn);
  ScrollTrigger.defaults({ scroller: scrollEl });
  ScrollTrigger.refresh();

  window.lenis = lenis;
}

// Initial Lenis setup
initLenis();

if (window.history.scrollRestoration) {
  window.history.scrollRestoration = 'manual';
}

function enforceHiddenScrollbar() {
  const html = document.documentElement;
  const body = document.body;
  const wrapper = document.getElementById('scroll-wrapper');
  if (!html || !body) return;

  html.style.scrollbarWidth = 'none';
  body.style.scrollbarWidth = 'none';
  html.style.msOverflowStyle = 'none';
  body.style.msOverflowStyle = 'none';
  if (wrapper) {
    wrapper.style.scrollbarWidth = 'none';
    wrapper.style.msOverflowStyle = 'none';
  }
}

function runPreloader() {
  const overlay = document.getElementById('preloader');
  const cover   = document.getElementById('page-cover');

  // Non-first visit: skip preloader text, just fade cover out
  if (sessionStorage.getItem('pl-shown')) {
    if (overlay) { overlay.style.display = 'none'; }
    // Fade out the page cover
    requestAnimationFrame(() => {
      if (cover) cover.classList.add('is-hidden');
    });
    return;
  }
  sessionStorage.setItem('pl-shown', '1');

  const text = document.getElementById('preloader-text');
  if (!overlay || !text) return;

  lenis?.stop();
  overlay.style.pointerEvents = 'all';

  gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    .to(text,    { opacity: 1,              duration: 0.9 })
    .to(text,    { opacity: 0,              duration: 0.6 }, '+=0.9')
    .to(overlay, { opacity: 0,              duration: 0.9 }, '+=0.15')
    .call(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      // Fade out the page cover after preloader
      if (cover) cover.classList.add('is-hidden');
      lenis?.start();
    });
}

async function initPage() {
  enforceHiddenScrollbar();
  await document.fonts.ready;
  runPreloader();
}

function handlePageLoad() {
  history.scrollRestoration = 'manual';

  // Recreate Lenis with the (potentially new) #scroll-wrapper
  initLenis();

  lenis.scrollTo(0, { immediate: true });
  ScrollTrigger.refresh();
  initPage();
}

// ── Init on DOMContentLoaded / load ──
document.addEventListener('DOMContentLoaded', handlePageLoad);

// bfcache (mobile back/forward cache)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    initLenis();
    ScrollTrigger.refresh();
  }
});

// Safety net for hard refresh
if (document.readyState === 'complete') {
  requestAnimationFrame(() => requestAnimationFrame(handlePageLoad));
}

// ── MPA link-click transition ──
// Fade page-cover IN, then let browser navigate
document.addEventListener('click', (e) => {
  const anchor = e.target.closest('a[href]');
  if (!anchor) return;

  const href = anchor.getAttribute('href');
  // Skip external links, anchors, javascript:, new-tab
  if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
      anchor.target === '_blank' || anchor.hasAttribute('download') ||
      e.ctrlKey || e.metaKey || e.shiftKey) return;

  // Skip non-local links
  try {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return;
  } catch { return; }

  e.preventDefault();
  const cover = document.getElementById('page-cover');
  if (cover) {
    cover.classList.remove('is-hidden');
    cover.classList.add('is-visible');
    // Navigate after fade completes
    cover.addEventListener('transitionend', () => {
      window.location.href = href;
    }, { once: true });
    // Fallback if transitionend doesn't fire
    setTimeout(() => { window.location.href = href; }, 400);
  } else {
    window.location.href = href;
  }
});

