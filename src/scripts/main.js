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

  // Only once per browser session — skip on SPA navigations
  if (sessionStorage.getItem('pl-shown')) {
    if (overlay) { overlay.style.display = 'none'; }
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

// ── Astro lifecycle ──
document.addEventListener('astro:page-load', handlePageLoad);

document.addEventListener('astro:before-swap', () => {
  destroyLenis();
  ScrollTrigger.getAll().forEach(st => st.kill(true));
  ScrollTrigger.clearScrollMemory();
});

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

