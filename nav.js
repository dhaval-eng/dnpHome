/* Shared top-nav + side-nav, injected into a <div id="site-nav"></div>
   placeholder. Usage: <script src="nav.js" data-active="blogs.html"></script>
   placed right after the placeholder div. data-active names the side-nav
   link (by href) to highlight for the current page; omit it on index.html. */
(function () {
  const file = location.pathname.split('/').pop();
  const onHome = file === '' || file === 'index.html';
  const homeHref = (hash) => (onHome ? hash : `index.html${hash}`);

  const activeHref = document.currentScript.dataset.active || '';

  const sideLinks = [
    { href: homeHref('#about'), label: 'Bio' },
    { href: 'blogs.html', label: 'Blogs' },
    { href: 'quotes.html', label: 'Quotes' },
    { href: 'dad-jokes.html', label: 'Dad Jokes' },
    { href: 'finances.html', label: 'Finances' },
  ];

  const topNavHtml = `
    <nav class="top-nav">
      <div class="wrap-wide row">
        <a class="brand" href="${homeHref('#top')}">DP</a>
        <div class="links">
          <a href="${homeHref('#about')}">About</a>
          <a href="${homeHref('#impact')}">Impact</a>
          <a href="${homeHref('#experience')}">Experience</a>
          <a href="${homeHref('#contact')}">Contact</a>
        </div>
      </div>
    </nav>`;

  const sideNavHtml = `
    <nav class="side-nav" aria-label="Site sections">
      ${sideLinks
        .map((l) => `<a href="${l.href}"${l.href === activeHref ? ' class="active"' : ''}>${l.label}</a>`)
        .join('')}
    </nav>`;

  document.getElementById('site-nav').outerHTML = topNavHtml + sideNavHtml;
})();
