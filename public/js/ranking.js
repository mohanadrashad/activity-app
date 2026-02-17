// --- Translations ---
const translations = {
  en: {
    rankingSubtitle: 'Participants Ranking',
    rankingTitle: 'Ranking',
    backToRegister: '\u2190 Back to Registration',
    rankName: 'Name',
    rankEmail: 'Email',
    rankPoints: 'Points',
    noRanking: 'No participants yet. Be the first to register!',
    errorLoad: 'Failed to load ranking.',
    footer: 'Bader - Activity Registration Platform',
  },
  ar: {
    rankingSubtitle: 'ترتيب المشاركين',
    rankingTitle: 'الترتيب',
    backToRegister: 'العودة للتسجيل \u2192',
    rankName: 'الاسم',
    rankEmail: 'البريد الإلكتروني',
    rankPoints: 'النقاط',
    noRanking: 'لا يوجد مشاركين بعد. كن أول من يسجل!',
    errorLoad: 'فشل في تحميل الترتيب.',
    footer: 'بادر - منصة تسجيل الأنشطة',
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';

  document.getElementById('btn-en').classList.toggle('active', lang === 'en');
  document.getElementById('btn-ar').classList.toggle('active', lang === 'ar');

  applyTranslations();
  loadRanking();
}

function t(key) {
  return translations[currentLang][key] || translations.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadRanking() {
  const container = document.getElementById('rankingContent');

  try {
    const res = await fetch('/api/ranking');
    const participants = await res.json();

    if (participants.length === 0) {
      container.innerHTML = `
        <div class="ranking-empty">
          <div class="ranking-empty-icon">🏆</div>
          <p>${t('noRanking')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t('rankName')}</th>
            <th>${t('rankEmail')}</th>
            <th>${t('rankPoints')}</th>
          </tr>
        </thead>
        <tbody>
          ${participants.map((p, i) => {
            const rank = i + 1;
            let badgeClass = '';
            if (rank === 1) badgeClass = 'gold';
            else if (rank === 2) badgeClass = 'silver';
            else if (rank === 3) badgeClass = 'bronze';

            const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');

            return `
              <tr>
                <td><span class="rank-badge ${badgeClass}">${rank}</span></td>
                <td>${escapeHtml(fullName)}</td>
                <td>${escapeHtml(p.email)}</td>
                <td class="points-cell">${p.total_points}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = `<p class="no-data">${t('errorLoad')}</p>`;
  }
}

// --- Initialize ---
setLang(currentLang);
loadRanking();
