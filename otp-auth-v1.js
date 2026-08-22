import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const REGISTRATION_KEY = 'genealogyRegistrationDraft';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const otpPanel = $('otpPanel');
const otpForm = $('otpForm');
const otpCode = $('otpCode');
const otpEmailLabel = $('otpEmailLabel');
const otpMessage = $('otpMessage');
const otpBack = $('otpBack');
const authMessage = $('authMessage');

const pending = {
  email: '',
  shouldCreateUser: false,
  busy: false,
};

function setMessage(el, text = '', type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = `message${type ? ` ${type}` : ''}`;
}

function friendlyAuthError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '').toLowerCase();

  if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return 'The email service is temporarily at its sending limit. Please wait before requesting another code.';
  }
  if (code === 'otp_expired' || message.includes('expired') || message.includes('invalid')) {
    return 'That code is no longer valid. Request a new code and use the newest email you receive.';
  }
  if (code === 'otp_disabled' || message.includes('signups not allowed')) {
    return 'We could not find a registered account for that email address. If you are new, use Register for family access.';
  }
  return error?.message || 'We could not complete email verification. Please try again.';
}

function setFormBusy(form, busy, busyText) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}

function registrationDraft() {
  return {
    first_name: $('registerFirstName').value.trim(),
    middle_names: $('registerMiddleNames').value.trim(),
    last_name: $('registerLastName').value.trim(),
    birth_date: $('registerBirthDate').value || null,
    email_updates_opt_in: $('registerUpdates').checked,
    email: $('registerEmail').value.trim(),
  };
}

function showCodeEntry(email) {
  otpEmailLabel.textContent = email;
  otpPanel.classList.remove('hidden');
  otpCode.value = '';
  setMessage(otpMessage, 'Enter the verification code from the newest email we sent you.');
  otpCode.focus();
  otpPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideCodeEntry() {
  otpPanel.classList.add('hidden');
  otpCode.value = '';
  setMessage(otpMessage, '');
  pending.email = '';
  pending.shouldCreateUser = false;
}

async function sendCode(email, shouldCreateUser) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  });
  if (error) throw error;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (pending.busy) return;

  const email = $('loginEmail').value.trim();
  pending.email = email;
  pending.shouldCreateUser = false;
  pending.busy = true;
  setFormBusy(loginForm, true, 'Sending code...');
  setMessage(authMessage, 'Sending your sign-in code...');

  try {
    await sendCode(email, false);
    showCodeEntry(email);
    setMessage(authMessage, 'If this email is registered, a sign-in code is on its way.', 'success');
  } catch (error) {
    setMessage(authMessage, friendlyAuthError(error), 'error');
  } finally {
    pending.busy = false;
    setFormBusy(loginForm, false, '');
  }
}, true);

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (pending.busy) return;

  const draft = registrationDraft();
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify(draft));
  pending.email = draft.email;
  pending.shouldCreateUser = true;
  pending.busy = true;
  setFormBusy(registerForm, true, 'Sending code...');
  setMessage(authMessage, 'Sending your verification code...');

  try {
    await sendCode(draft.email, true);
    showCodeEntry(draft.email);
    setMessage(authMessage, 'Check your email for the verification code, then enter it below.', 'success');
  } catch (error) {
    setMessage(authMessage, friendlyAuthError(error), 'error');
  } finally {
    pending.busy = false;
    setFormBusy(registerForm, false, '');
  }
}, true);

otpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending.busy) return;

  const token = otpCode.value.replace(/\D/g, '');
  if (!pending.email) {
    setMessage(otpMessage, 'Request a new code first.', 'error');
    return;
  }
  if (token.length < 6 || token.length > 10) {
    setMessage(otpMessage, 'Enter the complete numeric code exactly as it appears in the email.', 'error');
    return;
  }

  pending.busy = true;
  setFormBusy(otpForm, true, 'Verifying...');
  setMessage(otpMessage, 'Checking your code...');

  try {
    const { error } = await supabase.auth.verifyOtp({
      email: pending.email,
      token,
      type: 'email',
    });
    if (error) throw error;
    setMessage(otpMessage, 'Email verified. Opening the family archive...', 'success');
    window.location.reload();
  } catch (error) {
    setMessage(otpMessage, friendlyAuthError(error), 'error');
  } finally {
    pending.busy = false;
    setFormBusy(otpForm, false, '');
  }
});

otpCode.addEventListener('input', () => {
  otpCode.value = otpCode.value.replace(/\D/g, '').slice(0, 10);
});

otpBack.addEventListener('click', () => {
  hideCodeEntry();
  setMessage(authMessage, 'Enter the email address you want to use and request a new code.');
});
