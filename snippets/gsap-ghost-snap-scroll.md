# GSAP Ghost Container + Snap Scroll

**Pattern**: Fullscreen scroll-driven slideshow z `position: fixed` itemami napędzanymi przez ghost divs + wheel snap zintegrowany z Lenis.

---

## Kiedy użyć

- Fullscreen slides scrollowane jako sekcja (nie osobne strony)
- Potrzebujesz scrub animacji (ScrollTrigger) ORAZ snap do punktów
- Smooth scroll przez Lenis musi współpracować z wheel snap

---

## Kluczowe koncepty

### 1. Ghost Container Pattern

Prawdziwe elementy są `position: fixed` (zawsze na ekranie).  
Ghost divy w normalnym flow tworzą scroll distance i służą jako ScrollTrigger triggers.

```js
// Ghost divy — tworzą scroll distance
const ghostContainer = document.createElement('div');
ghostContainer.style.cssText = 'position:relative;width:100%;';
section.appendChild(ghostContainer);

const ghostItems = items.map(() => {
  const ghost = document.createElement('div');
  ghost.style.cssText = 'width:100%;height:400vh;'; // 2 snap stops × 200vh
  ghostContainer.appendChild(ghost);
  return ghost;
});

// Items przypięte do viewportu
gsap.set(items, {
  position: 'fixed', top: 0, left: 0,
  clipPath: 'inset(0 0% 0 100%)',
  zIndex: 10, visibility: 'hidden',
});

// Widoczne tylko gdy ghost container w viewport
ScrollTrigger.create({
  trigger: ghostContainer,
  start: 'top 100%', end: 'bottom top',
  onEnter:     () => gsap.set(items, { visibility: 'visible' }),
  onLeaveBack: () => gsap.set(items, { visibility: 'hidden' }),
});
```

### 2. Snap Points

Każdy ghost = 400vh → 2 punkty snap:
- **A** = ghost top + 25% (100vh) → faza 1 skończona
- **B** = ghost top + 70% (280vh) → faza 2 skończona

```js
// Oblicz RAZ po ScrollTrigger.refresh() przez double-rAF
const snapPoints = [];
function precomputeSnapPoints() {
  snapPoints.length = 0;
  const sy = getScrollY();
  ghostItems.forEach(g => {
    const top = g.getBoundingClientRect().top + sy;
    const h = g.offsetHeight; // 400vh
    snapPoints.push(top + h * 0.25); // snap A
    snapPoints.push(top + h * 0.70); // snap B
  });
}

// WAŻNE: double-rAF żeby ScrollTrigger.refresh() zdążył się skończyć
ScrollTrigger.refresh();
requestAnimationFrame(() => requestAnimationFrame(() => initSnapScroll(ghostItems)));
```

### 3. Wheel Snap + Lenis

Kluczowe problemy i rozwiązania:

| Problem | Rozwiązanie |
|---|---|
| Lenis intercepts wheel events | `capture: true` — nasz handler odpala pierwszy |
| `lenis.stop()` psuje `onComplete` | Nie używaj `stop()` — Lenis sam zarządza `scrollTo` |
| Debounce nie działa | Lenis tiker stale emituje eventy — zamiast tegoisSnapping flag |
| `scroll` event Lenis nie odpala na wheel | Nie używaj `lenis.on('scroll')` dla wheel detection |

```js
function initSnapScroll(ghostItems) {
  // Desktop only — na mobile natywny scroll jest lepszy
  if (window.matchMedia('(max-width: 900px)').matches) return;

  let isSnapping = false;
  let lastSnapTime = 0;
  const DURATION = 1.05;

  function getScrollY() {
    const lenis = window.lenis;
    if (lenis && typeof lenis.scroll === 'number') return lenis.scroll;
    return document.scrollingElement?.scrollTop ?? window.scrollY;
  }

  // Precompute raz, przelicz przy resize
  const snapPoints = [];
  function precomputeSnapPoints() {
    snapPoints.length = 0;
    const sy = getScrollY();
    ghostItems.forEach(g => {
      const top = g.getBoundingClientRect().top + sy;
      const h = g.offsetHeight;
      snapPoints.push(top + h * 0.25);
      snapPoints.push(top + h * 0.70);
    });
  }
  precomputeSnapPoints();
  window.addEventListener('resize', precomputeSnapPoints, { passive: true });

  function isInZone() {
    if (!snapPoints.length) return false;
    const sy = getScrollY();
    return sy >= snapPoints[0] - window.innerHeight
        && sy <= snapPoints[snapPoints.length - 1] + window.innerHeight;
  }

  function getSnapTarget(delta) {
    const sy = getScrollY();
    const BUFFER = 80;
    if (delta === 1) {
      for (const pt of snapPoints) if (pt > sy + BUFFER) return pt;
    } else {
      for (let i = snapPoints.length - 1; i >= 0; i--)
        if (snapPoints[i] < sy - BUFFER) return snapPoints[i];
    }
    return -1; // brak punktu → puść normalny scroll
  }

  function doSnap(delta) {
    if (isSnapping) return;
    const target = getSnapTarget(delta);
    if (target === -1) return;

    const lenis = window.lenis;
    isSnapping = true;
    lastSnapTime = Date.now();

    const safety = setTimeout(() => { isSnapping = false; }, DURATION * 1000 + 400);

    if (lenis) {
      lenis.scrollTo(target, {
        duration: DURATION,
        easing: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
        onComplete: () => { clearTimeout(safety); isSnapping = false; },
      });
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
      setTimeout(() => { clearTimeout(safety); isSnapping = false; }, DURATION * 1000 + 300);
    }
  }

  function onWheel(e) {
    if (!isInZone()) return;

    // Reset blokady jeśli za długo (safety net)
    if (isSnapping && Date.now() - lastSnapTime > 2000) isSnapping = false;

    const delta = e.deltaY > 0 ? 1 : -1;
    const target = getSnapTarget(delta);

    if (target === -1) return; // nie blokuj — wychodzimy z sekcji

    // Jest snap target — przejmij kontrolę nad scrollem
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isSnapping) return;
    doSnap(delta);
  }

  // capture: true — odpala PRZED Lenis bubble-phase handlerem
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('resize', precomputeSnapPoints, { passive: true });

  // Cleanup przy Astro page transition
  document.addEventListener('astro:before-preparation', () => {
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('resize', precomputeSnapPoints);
  }, { once: true });
}
```

---

## Struktura faz animacji (400vh = 1 pakiet)

```
0%        25%       70%       100%
|────────── A ───────── B ──────|
Phase 1:  clip reveal + slide in
          |─────────|
Phase 2:          cards fly in + bg darkens
                  |────────────|
Phase 3:                        exit slide
                               |──────────|
```

- **Snap A** (`25%` = 100vh) — koniec Phase 1, karty jeszcze nie wleciały
- **Snap B** (`70%` = 280vh) — koniec Phase 2, karty ułożone, bg ciemne

---

## main.js — Lenis + ScrollTrigger setup

```js
// Mobile: normalizeScroll żeby fixed działo płynniej
if (isMobile) {
  ScrollTrigger.normalizeScroll(true);
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
  });
} else {
  // Desktop: Lenis smooth scroll
  lenis = new Lenis({ autoRaf: false, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // ScrollTrigger używa Lenis jako scroller
  ScrollTrigger.scrollerProxy(document.body, {
    scrollTop(value) {
      if (arguments.length) lenis.scrollTo(value, { immediate: true });
      return lenis.scroll;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    },
    pinType: document.body.style.transform ? 'transform' : 'fixed',
  });

  ScrollTrigger.addEventListener('refresh', () => lenis.resize());
  ScrollTrigger.refresh();
}

window.lenis = lenis; // dostępne globalnie dla initSnapScroll
```

---

## CSS — GPU hints dla mobile

```css
@media (max-width: 900px) {
  .pkg-item {
    will-change: transform, clip-path;
    transform: translateZ(0);
    backface-visibility: hidden;
  }
  .pkg-item-container { will-change: transform; transform: translateZ(0); }
  .pkg-item-bg img    { will-change: transform, filter; transform: translateZ(0); }
  .pkg-item-image     { will-change: transform, opacity; transform: translateZ(0); }
}
```

---

## Gotcha lista

- `removeEventListener` dla capture listenera **musi** mieć `{ capture: true }` — inaczej nie usuwa
- `lenis.stop()` przed `scrollTo` → `onComplete` nigdy nie odpala (Lenis ticker zatrzymany)
- `getBoundingClientRect()` ghostów **zmienia się** podczas scrollu gdy items są `fixed` — dlatego snap points liczyć raz przy init (`precomputeSnapPoints`)
- `lenis.on('scroll')` nie odpala na wheel events — tylko drag/programmatic
- `gsap.context().revert()` przy Astro page transitions — czyści wszystkie ScrollTriggers
