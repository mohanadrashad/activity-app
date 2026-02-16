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

    activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

    if (activities.length === 0) {
      activitySelect.innerHTML = '<option value="">No activities available today</option>';
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
    showMessage('Failed to load activities.', 'error');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    first_name: document.getElementById('firstName').value.trim(),
    middle_name: document.getElementById('middleName').value.trim(),
    last_name: document.getElementById('lastName').value.trim(),
    activity_id: parseInt(activitySelect.value),
  };

  if (!data.first_name || !data.last_name || !data.activity_id) {
    showMessage('Please fill in all required fields.', 'error');
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
      showMessage('Registration successful! Thank you.', 'success');
      form.reset();
    } else {
      showMessage(result.error || 'Registration failed.', 'error');
    }
  } catch (err) {
    showMessage('Server error. Please try again.', 'error');
  }
});

loadActivities();
