const loginModal = document.getElementById('loginModal');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// --- Auth State ---
let currentUser = JSON.parse(localStorage.getItem('adminUser') || '{"email":"","role":""}');

function showDashboard() {
  loginModal.style.display = 'none';
  dashboard.style.display = 'block';
  if (currentUser.role === 'super_admin') {
    document.getElementById('usersTab').style.display = '';
  }
  loadActivities();
  loadParticipants();
}

// Restore session on page load
if (currentUser.email) {
  showDashboard();
}

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = { email: data.email, role: data.role };
      localStorage.setItem('adminUser', JSON.stringify(currentUser));
      showDashboard();
    } else {
      loginError.textContent = data.error || 'Invalid credentials.';
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
    if (tab.dataset.tab === 'users') loadUsers();
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
        <td>
          <button class="btn btn-view-participants" onclick="toggleActivityParticipants(${a.id}, this)">
            ${a.participant_count} <span class="expand-icon">&#9654;</span>
          </button>
        </td>
        <td class="actions">
          <button class="btn btn-add-participant" onclick="showAddParticipant(${a.id})">Add Person</button>
          <button class="btn btn-edit" onclick="editActivity(${a.id}, '${escapeHtml(a.name)}', ${a.points}, '${a.active_date}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteActivity(${a.id})">Delete</button>
        </td>
      </tr>
      <tr class="participants-row" id="participants-row-${a.id}" style="display:none;">
        <td colspan="5" class="participants-cell">
          <div class="activity-participants" id="activity-participants-${a.id}">Loading...</div>
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

// --- View Participants per Activity ---
async function toggleActivityParticipants(activityId, btn) {
  const row = document.getElementById(`participants-row-${activityId}`);
  const container = document.getElementById(`activity-participants-${activityId}`);
  const icon = btn.querySelector('.expand-icon');

  if (row.style.display !== 'none') {
    row.style.display = 'none';
    icon.innerHTML = '&#9654;';
    return;
  }

  row.style.display = '';
  icon.innerHTML = '&#9660;';
  container.innerHTML = 'Loading...';

  try {
    const res = await fetch(`/api/admin/activities/${activityId}/participants`);
    const participants = await res.json();

    if (participants.length === 0) {
      container.innerHTML = '<p class="no-data" style="padding:10px;">No participants yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="sub-table-header">
        <button class="btn btn-export" onclick="window.location.href='/api/admin/activities/${activityId}/export'" style="padding:6px 14px; font-size:13px;">Download Excel</button>
      </div>
      <table class="sub-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Registered At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${participants.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(p.first_name + ' ' + p.last_name)}</td>
              <td>${escapeHtml(p.email)}</td>
              <td>${p.submitted_at}</td>
              <td>
                <button class="btn btn-danger" onclick="removeParticipantFromActivity(${p.id}, ${activityId})">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p class="no-data" style="padding:10px;">Failed to load participants.</p>';
  }
}

async function removeParticipantFromActivity(participantId, activityId) {
  if (!confirm('Remove this participant from this activity?')) return;

  try {
    const res = await fetch(`/api/admin/participants/single/${participantId}`, { method: 'DELETE' });
    if (res.ok) {
      // Re-expand to refresh the list
      const btn = document.querySelector(`#participants-row-${activityId}`).previousElementSibling.querySelector('.btn-view-participants');
      const row = document.getElementById(`participants-row-${activityId}`);
      row.style.display = 'none';
      btn.querySelector('.expand-icon').innerHTML = '&#9654;';
      toggleActivityParticipants(activityId, btn);
      loadActivities();
      loadParticipants();
    } else {
      alert('Failed to remove participant.');
    }
  } catch {
    alert('Failed to remove participant.');
  }
}

// --- Add Participant to Activity ---
function showAddParticipant(activityId) {
  const modal = document.getElementById('addParticipantModal');
  document.getElementById('addPartActivityId').value = activityId;
  document.getElementById('addPartForm').reset();
  document.getElementById('addPartMessage').className = 'message';
  modal.style.display = 'flex';
}

function closeAddParticipantModal() {
  document.getElementById('addParticipantModal').style.display = 'none';
}

document.getElementById('addPartForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const activityId = document.getElementById('addPartActivityId').value;
  const msgDiv = document.getElementById('addPartMessage');

  const data = {
    first_name: document.getElementById('addPartFirst').value.trim(),
    last_name: document.getElementById('addPartLast').value.trim(),
    email: document.getElementById('addPartEmail').value.trim(),
  };

  if (!data.first_name || !data.last_name || !data.email) {
    msgDiv.textContent = 'All fields are required.';
    msgDiv.className = 'message error';
    return;
  }

  try {
    const res = await fetch(`/api/admin/activities/${activityId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      msgDiv.textContent = 'Participant added successfully!';
      msgDiv.className = 'message success';
      document.getElementById('addPartForm').reset();
      loadActivities();
      loadParticipants();
    } else {
      msgDiv.textContent = result.error || 'Failed to add participant.';
      msgDiv.className = 'message error';
    }
  } catch {
    msgDiv.textContent = 'Server error.';
    msgDiv.className = 'message error';
  }
});

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

// --- Users Management (Super Admin) ---
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'x-admin-email': currentUser.email },
    });
    const users = await res.json();
    const tbody = document.getElementById('usersBody');
    const noData = document.getElementById('noUsers');

    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = '';
      noData.style.display = 'block';
      return;
    }

    noData.style.display = 'none';
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="role-badge role-${u.role}">${u.role === 'super_admin' ? 'Super Admin' : 'Admin'}</span></td>
        <td>${u.created_at}</td>
        <td class="actions">
          ${u.role !== 'super_admin' ? `<button class="btn btn-danger" onclick="deleteUser(${u.id})">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch {
    alert('Failed to load users.');
  }
}

document.getElementById('createUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;

  if (!email || !password) return;

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': currentUser.email,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      document.getElementById('createUserForm').reset();
      loadUsers();
    } else {
      alert(data.error || 'Failed to create user.');
    }
  } catch {
    alert('Failed to create user.');
  }
});

async function deleteUser(id) {
  if (!confirm('Delete this admin user?')) return;

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-email': currentUser.email },
    });

    if (res.ok) {
      loadUsers();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to delete user.');
    }
  } catch {
    alert('Failed to delete user.');
  }
}

// --- Search / Filter ---
function filterActivities() {
  const query = document.getElementById('searchActivities').value.toLowerCase();
  const rows = document.querySelectorAll('#activitiesBody tr');
  rows.forEach(row => {
    if (row.classList.contains('participants-row')) {
      // Hide expanded participant rows when filtering
      if (query) row.style.display = 'none';
      return;
    }
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

function filterParticipants() {
  const query = document.getElementById('searchParticipants').value.toLowerCase();
  const rows = document.querySelectorAll('#participantsBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

// --- Logout ---
function logout() {
  currentUser = { email: '', role: '' };
  localStorage.removeItem('adminUser');
  location.reload();
}

// --- Utility ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
