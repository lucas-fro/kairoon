/* Kairoon — Landing Page
   Interações discretas: header, reveal on scroll, menu mobile,
   accordion do FAQ e carrossel de depoimentos. */

(function () {
  'use strict';

  /* ---------- Header: fundo ao rolar ---------- */
  var header = document.getElementById('header');

  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Menu mobile ---------- */
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  navToggle.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });

  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) {
      document.body.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- Reveal on scroll ---------- */
  var revealItems = document.querySelectorAll('[data-reveal]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );

    revealItems.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var question = item.querySelector('.faq-q');

    question.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach(function (other) {
        other.classList.remove('open');
        other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('open');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- Carrossel de depoimentos ---------- */
  var track = document.getElementById('quoteTrack');

  if (track) {
    var prevBtn = document.getElementById('quotePrev');
    var nextBtn = document.getElementById('quoteNext');

    function cardStep() {
      var card = track.querySelector('.quote-card');
      if (!card) return 360;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      return card.getBoundingClientRect().width + gap;
    }

    function updateButtons() {
      var maxScroll = track.scrollWidth - track.clientWidth - 2;
      if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
      if (nextBtn) nextBtn.disabled = track.scrollLeft >= maxScroll;
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        track.scrollBy({ left: -cardStep(), behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        track.scrollBy({ left: cardStep(), behavior: 'smooth' });
      });
    }

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();

    /* Arrastar para rolar (mouse/touch via Pointer Events) */
    var isDown = false;
    var startX = 0;
    var startLeft = 0;
    var moved = false;

    track.addEventListener('pointerdown', function (event) {
      isDown = true;
      moved = false;
      startX = event.clientX;
      startLeft = track.scrollLeft;
      track.classList.add('dragging');
      track.setPointerCapture(event.pointerId);
    });

    track.addEventListener('pointermove', function (event) {
      if (!isDown) return;
      var dx = event.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startLeft - dx;
    });

    function endDrag() {
      if (!isDown) return;
      isDown = false;
      track.classList.remove('dragging');
      updateButtons();
    }

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    /* Evita que o clique acidental após arrastar dispare links */
    track.addEventListener(
      'click',
      function (event) {
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
  }
})();
