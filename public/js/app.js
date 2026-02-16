// --- Translations ---
const translations = {
  en: {
    title: 'Activity Registration',
    subtitle: 'Register for today\'s available activities',
    firstName: 'First Name *',
    firstNamePlaceholder: 'Enter first name',
    lastName: 'Last Name *',
    lastNamePlaceholder: 'Enter last name',
    email: 'Email *',
    emailPlaceholder: 'Enter your email',
    selectActivity: 'Select Activity *',
    selectOption: '-- Select an activity --',
    noActivities: 'No activities available today',
    submit: 'Submit Registration',
    successMsg: 'Registration successful! Thank you.',
    errorFillFields: 'Please fill in all required fields.',
    errorServer: 'Server error. Please try again.',
    errorLoadActivities: 'Failed to load activities.',
  },
  ar: {
    title: 'تسجيل النشاط',
    subtitle: 'سجّل في الأنشطة المتاحة اليوم',
    firstName: '* الاسم الأول',
    firstNamePlaceholder: 'أدخل الاسم الأول',
    lastName: '* اسم العائلة',
    lastNamePlaceholder: 'أدخل اسم العائلة',
    email: '* البريد الإلكتروني',
    emailPlaceholder: 'أدخل بريدك الإلكتروني',
    selectActivity: '* اختر النشاط',
    selectOption: '-- اختر نشاطاً --',
    noActivities: 'لا توجد أنشطة متاحة اليوم',
    submit: 'إرسال التسجيل',
    successMsg: 'تم التسجيل بنجاح! شكراً لك.',
    errorFillFields: 'يرجى ملء جميع الحقول المطلوبة.',
    errorServer: 'خطأ في الخادم. يرجى المحاولة مرة أخرى.',
    errorLoadActivities: 'فشل في تحميل الأنشطة.',
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
}

function t(key) {
  return translations[currentLang][key] || translations.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
}

// --- App Logic ---
const activitySelect = document.getElementById('activity');
const form = document.getElementById('registrationForm');
const messageDiv = document.getElementById('message');

function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = 'message ' + type;
  setTimeout(() => { messageDiv.className = 'message'; }, 5000);
}

async function loadActivities() {
  try {
    const res = await fetch('/api/activities/today');
    const activities = await res.json();

    activitySelect.innerHTML = `<option value="">${t('selectOption')}</option>`;

    if (activities.length === 0) {
      activitySelect.innerHTML = `<option value="">${t('noActivities')}</option>`;
      activitySelect.disabled = true;
      document.getElementById('submitBtn').disabled = true;
      return;
    }

    activities.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.points} pts)`;
      activitySelect.appendChild(opt);
    });
  } catch (err) {
    showMessage(t('errorLoadActivities'), 'error');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    first_name: document.getElementById('firstName').value.trim(),
    last_name: document.getElementById('lastName').value.trim(),
    email: document.getElementById('email').value.trim(),
    activity_id: parseInt(activitySelect.value),
  };

  if (!data.first_name || !data.last_name || !data.email || !data.activity_id) {
    showMessage(t('errorFillFields'), 'error');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      showMessage(t('successMsg'), 'success');
      form.reset();
    } else {
      showMessage(result.error || 'Registration failed.', 'error');
    }
  } catch (err) {
    showMessage(t('errorServer'), 'error');
  }
});

// --- Initialize ---
setLang(currentLang);
loadActivities();
