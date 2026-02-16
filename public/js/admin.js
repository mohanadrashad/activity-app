const loginModal = document.getElementById('loginModal');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      loginModal.style.display = 'none';
      dashboard.style.display = 'block';
      loadActivities();
      loadParticipants();
    } else {
      loginError.textContent = 'Invalid password. Try again.';
      loginError.className = 'message error';
    }
  } catch {
    loginError.textContent = 'Server error.';
    loginError.className = 'message error';
  }
});

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

    if (tab.dataset.tab === 'participants') loadParticipants();
    if (tab.dataset.tab === 'activities') loadActivities();
  });
});

// --- Activities ---
let editingId = null;

const activityForm = document.getElementById('activityForm');
const actSubmitBtn = document.getElementById('actSubmitBtn');

activityForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    name: document.getElementById('actName').value.trim(),
    points: parseInt(document.getElementById('actPoints').value),
    active_date: document.getElementById('actDate').value,
  };

  const url = editingId
    ? `/api/admin/activities/${editingId}`
    : '/api/admin/activities';
  const method = editingId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      activityForm.reset();
      editingId = null;
      actSubmitBtn.textContent = 'Create Activity';
      loadActivities();
    }
  } catch (err) {
    alert('Failed to save activity.');
  }
});

async function loadActivities() {
  try {
    const res = await fetch('/api/admin/activities');
    const activities = await res.json();
    const tbody = document.getElementById('activitiesBody');
    const noData = document.getElementById('noActivities');

    if (activities.length === 0) {
      tbody.innerHTML = '';
      noData.style.display = 'block';
      return;
    }

    noData.style.display = 'none';
    tbody.innerHTML = activities.map(a => `
      <tr>
        <td>${escapeHtml(a.name)}</td>
        <td>${a.points}</td>
        <td>${a.active_date}</td>
        <td class="actions">
          <button class="btn btn-edit" onclick="editActivity(${a.id}, '${escapeHtml(a.name)}', ${a.points}, '${a.active_date}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteActivity(${a.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch {
    alert('Failed to load activities.');
  }
}

function editActivity(id, name, points, date) {
  editingId = id;
  document.getElementById('actName').value = name;
  document.getElementById('actPoints').value = points;
  document.getElementById('actDate').value = date;
  actSubmitBtn.textContent = 'Update Activity';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteActivity(id) {
  if (!confirm('Delete this activity and all its participants?')) return;

  try {
    await fetch(`/api/admin/activities/${id}`, { method: 'DELETE' });
    loadActivities();
    loadParticipants();
  } catch {
    alert('Failed to delete activity.');
  }
}

// --- Participants ---
async function loadParticipants() {
  try {
    const res = await fetch('/api/admin/participants');
    const participants = await res.json();
    const tbody = document.getElementById('participantsBody');
    const noData = document.getElementById('noParticipants');

    if (participants.length === 0) {
      tbody.innerHTML = '';
      noData.style.display = 'block';
      return;
    }

    noData.style.display = 'none';
    document.getElementById('selectAll').checked = false;
    document.getElementById('deleteSelectedBtn').style.display = 'none';
    tbody.innerHTML = participants.map((p, i) => {
      const rank = i + 1;
      let badgeClass = '';
      if (rank === 1) badgeClass = 'gold';
      else if (rank === 2) badgeClass = 'silver';
      else if (rank === 3) badgeClass = 'bronze';

      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');

      return `
        <tr>
          <td><input type="checkbox" class="participant-checkbox" value="${escapeHtml(p.email)}" onchange="updateDeleteBtn()"></td>
          <td><span class="rank-badge ${badgeClass}">${rank}</span></td>
          <td>${escapeHtml(fullName)}</td>
          <td>${escapeHtml(p.email)}</td>
          <td>${p.total_points}</td>
          <td>${escapeHtml(p.activities)}</td>
          <td class="actions">
            <button class="btn btn-edit" onclick="editParticipant('${escapeHtml(p.email)}', '${escapeHtml(p.first_name)}', '${escapeHtml(p.last_name)}')">Edit</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch {
    alert('Failed to load participants.');
  }
}

// --- Select All / Delete Selected ---
function toggleSelectAll(checkbox) {
  document.querySelectorAll('.participant-checkbox').forEach(cb => {
    cb.checked = checkbox.checked;
  });
  updateDeleteBtn();
}

function updateDeleteBtn() {
  const checked = document.querySelectorAll('.participant-checkbox:checked');
  document.getElementById('deleteSelectedBtn').style.display = checked.length > 0 ? 'inline-block' : 'none';
}

async function deleteSelectedParticipants() {
  const checked = document.querySelectorAll('.participant-checkbox:checked');
  const emails = Array.from(checked).map(cb => cb.value);

  if (emails.length === 0) return;
  if (!confirm(`Delete ${emails.length} participant(s) and all their registrations?`)) return;

  try {
    const res = await fetch('/api/admin/participants/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });

    if (res.ok) {
      loadParticipants();
    } else {
      alert('Failed to delete participants.');
    }
  } catch {
    alert('Failed to delete participants.');
  }
}

// --- Edit Participant ---
function editParticipant(email, firstName, lastName) {
  const newFirst = prompt('First Name:', firstName);
  if (newFirst === null) return;
  const newLast = prompt('Last Name:', lastName);
  if (newLast === null) return;
  const newEmail = prompt('Email:', email);
  if (newEmail === null) return;

  fetch(`/api/admin/participants/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: newFirst, last_name: newLast, new_email: newEmail }),
  }).then(res => {
    if (res.ok) {
      loadParticipants();
    } else {
      alert('Failed to update participant.');
    }
  }).catch(() => alert('Failed to update participant.'));
}

// --- Export ---
function exportExcel() {
  window.location.href = '/api/admin/export';
}

// --- Utility ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
