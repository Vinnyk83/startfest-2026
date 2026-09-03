(function () {
  function clearErrors() {
    ['email', 'password', 'fullName', 'form'].forEach((f) => {
      const el = document.getElementById(f + '-error');
      if (el) {
        el.textContent = '';
        el.style.display = 'none';
      }
    });
  }

  function showFieldError(field, msg) {
    const el = document.getElementById(field + '-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  async function onSubmit(e) {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('fullName').value.trim();
    const jobTitle = document.getElementById('jobTitle').value.trim();
    const company = document.getElementById('company').value.trim();
    const bio = document.getElementById('bio').value.trim();

    let hasError = false;
    if (!email) {
      showFieldError('email', 'Email is required.');
      hasError = true;
    }
    if (!password || password.length < 8) {
      showFieldError('password', 'Password must be at least 8 characters.');
      hasError = true;
    }
    if (!fullName) {
      showFieldError('fullName', 'Full name is required.');
      hasError = true;
    }
    if (hasError) return;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      await App.fetchJson('/api/auth/register', {
        method: 'POST',
        body: { email, password, fullName, jobTitle: jobTitle || undefined, company: company || undefined, bio: bio || undefined },
      });
      window.location.href = '/';
    } catch (err) {
      btn.disabled = false;
      if (err.status === 400 && err.data && err.data.error === 'VALIDATION') {
        const fields = err.data.fields || {};
        let any = false;
        Object.keys(fields).forEach((f) => {
          if (document.getElementById(f + '-error')) {
            showFieldError(f, fields[f]);
            any = true;
          }
        });
        if (!any) showFieldError('form', 'Please check the form and try again.');
      } else {
        showFieldError('form', "Couldn't create your account. Check your connection and try again.");
      }
    }
  }

  async function init() {
    App.renderNav('/register');
    document.getElementById('register-form').addEventListener('submit', onSubmit);
  }

  init();
})();
