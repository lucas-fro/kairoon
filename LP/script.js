(function () {
  var header = document.getElementById('siteHeader');
  var navToggle = document.getElementById('navToggle');
  var mobileMenu = document.getElementById('mobileMenu');

  function setScrolled() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  setScrolled();
  window.addEventListener('scroll', setScrolled, { passive: true });

  function closeMenu() {
    navToggle.classList.remove('is-open');
    mobileMenu.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  navToggle.addEventListener('click', function () {
    var isOpen = mobileMenu.classList.toggle('is-open');
    navToggle.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  mobileMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 899) closeMenu();
  });

  var revealTargets = document.querySelectorAll('.use-cases, .feature-mobile, .cta, .testimonial');
  if ('IntersectionObserver' in window && revealTargets.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealTargets.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  var stack = document.getElementById('testimonialStack');
  var dotsWrap = document.getElementById('testimonialDots');
  if (stack && dotsWrap) {
    var cards = Array.prototype.slice.call(stack.querySelectorAll('.testimonial-card'));
    var dots = Array.prototype.slice.call(dotsWrap.querySelectorAll('.testimonial-dot'));
    var n = cards.length;
    var current = 0;
    var timer = null;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function layout() {
      cards.forEach(function (card, i) {
        card.setAttribute('data-depth', (i - current + n) % n);
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === current);
      });
    }

    function goTo(index) {
      if (index === current) return;
      var leaving = cards[current];
      leaving.classList.add('is-leaving');
      window.setTimeout(function () {
        leaving.classList.remove('is-leaving');
      }, 600);
      current = index;
      layout();
    }

    function next() {
      goTo((current + 1) % n);
    }

    function startAutoplay() {
      if (reduceMotion || n < 2) return;
      window.clearInterval(timer);
      timer = window.setInterval(next, 10000);
    }

    dots.forEach(function (dot, index) {
      dot.addEventListener('click', function () {
        goTo(index);
        startAutoplay();
      });
    });

    layout();
    startAutoplay();
  }

  var faqList = document.getElementById('faqList');
  if (faqList) {
    var faqItems = Array.prototype.slice.call(faqList.querySelectorAll('.faq-item'));

    faqItems.forEach(function (item) {
      var question = item.querySelector('.faq-question');
      if (!question) return;

      question.addEventListener('click', function () {
        var isOpen = item.classList.contains('is-open');

        faqItems.forEach(function (other) {
          other.classList.remove('is-open');
          var q = other.querySelector('.faq-question');
          if (q) q.setAttribute('aria-expanded', 'false');
        });

        if (!isOpen) {
          item.classList.add('is-open');
          question.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  var plansToggle = document.getElementById('plansToggle');
  if (plansToggle) {
    var periodBtns = Array.prototype.slice.call(plansToggle.querySelectorAll('.plans-toggle-btn'));
    var planCards = Array.prototype.slice.call(document.querySelectorAll('#planos .plans-table-plan'));

    function setPeriod(period) {
      plansToggle.setAttribute('data-active', period);

      periodBtns.forEach(function (btn) {
        var on = btn.getAttribute('data-period') === period;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', String(on));
      });

      planCards.forEach(function (card) {
        var amount = card.querySelector('.plan-amount[data-monthly]');
        if (!amount) return;
        amount.textContent =
          period === 'annual' ? amount.getAttribute('data-annual') : amount.getAttribute('data-monthly');
        // Sublinha do preço, sempre uma linha só pra ficar limpo: no anual mostra
        // o total do ano + parcelamento (o número grande continua sendo o
        // equivalente por mês, que gera desejo); no mensal, só "cobrado mensalmente".
        var billing = card.querySelector('.plan-billing');
        var annualTotal = card.querySelector('.plan-annual-total');
        if (period === 'annual') {
          if (billing) billing.hidden = true;
          if (annualTotal) {
            var totalPerYear = Number(amount.getAttribute('data-annual')) * 12;
            annualTotal.innerHTML =
              'R$' +
              totalPerYear.toLocaleString('pt-BR') +
              '/ano <span class="plan-installments">em até 12x no cartão</span>';
            annualTotal.hidden = false;
          }
        } else {
          if (billing) {
            billing.textContent = 'cobrado mensalmente';
            billing.hidden = false;
          }
          if (annualTotal) annualTotal.hidden = true;
        }

        // Propaga o ciclo escolhido pro checkout (cards Básico/Essencial only).
        var cta = card.querySelector('[data-plan-cta]');
        if (cta) {
          var cycle = period === 'annual' ? 'yearly' : 'monthly';
          var url = new URL(cta.getAttribute('href'), window.location.href);
          url.searchParams.set('cycle', cycle);
          cta.setAttribute('href', url.toString());
        }
      });

      // Onde o desconto do cupom incide muda por ciclo, e essa diferença
      // precisa estar na frente do olho: no mensal vale só a primeira cobrança,
      // no anual vale o ano contratado inteiro. Espelha promoScopeLabel
      // (frontend/src/lib/promo.ts).
      var promoScope = document.getElementById('promoScope');
      if (promoScope) {
        promoScope.textContent =
          period === 'annual' ? 'no valor total do primeiro ano' : 'no primeiro mês';
      }
    }

    periodBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPeriod(btn.getAttribute('data-period'));
      });
    });

    // Estado inicial derivado do data-active (anual por padrão): garante que
    // preços, rótulos e CTAs já saem consistentes sem depender de clique.
    setPeriod(plansToggle.getAttribute('data-active') || 'annual');
  }

  // Cronômetro do banner da promo. Espelha endOfLocalDay/formatCountdown
  // (frontend/src/lib/promo.ts): o prazo é o fim do dia local, recalculado a
  // cada tick em vez de guardado no carregamento, pra o contador atravessar a
  // virada do dia, o notebook dormindo e o horário de verão sem travar em zero.
  var promoCountdown = document.getElementById('promoCountdown');
  if (promoCountdown) {
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };

    var tickPromo = function () {
      var end = new Date();
      end.setHours(24, 0, 0, 0);
      var total = Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000));
      promoCountdown.textContent =
        pad(Math.floor(total / 3600)) + 'h:' + pad(Math.floor((total % 3600) / 60)) + 'm:' + pad(total % 60) + 's';
    };

    tickPromo();
    window.setInterval(tickPromo, 1000);
  }
})();
