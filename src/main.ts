/**
 * Main application entry point.
 * Handles role-based routing and authentication via Firebase.
 *
 * Routing Logic:
 *   Not logged in      → /src/pages/login.html
 *   Logged in + admin  → /src/pages/admin.html
 *   Logged in + client → /src/pages/dashboard.html
 */

// Initialize Firebase first
import './services/firebase';

import {
  login,
  logout,
  listenToAuthChanges,
  getCurrentUser,
  register,
  getUserProfile,
} from './services/authService';

import {
  getCaseByUserId,
  getAllCasesByUserId,
  getAllCases,
  createCase,
  updateCase,
  CASE_STAGES,
} from './services/caseService';
import type { Case } from './services/caseService';

import {
  uploadDocument,
  getAllUsers,
} from './services/documentService';

import { getUserRole } from './services/roleService';

// ─────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────
let isUserAuthenticated = false;
let isLoginMode = true;
let currentView: 'login' | 'dashboard' | 'admin' | null = null;

// ─────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────

/**
 * Main router: determines which page to show based on auth state and role.
 */
async function router(): Promise<void> {
  const appElement = document.getElementById('app');
  if (!appElement) return;

  if (!isUserAuthenticated) {
    await loadView('login', appElement);
    setupAuthEvents();
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    await loadView('login', appElement);
    setupAuthEvents();
    return;
  }

  // Fetch role — single call drives both routing AND navbar badge
  const role = await getUserRole(user.uid);
  console.log('USER:', user.uid, user.email);
  console.log('ROLE:', role);

  if (role === 'admin') {
    await loadView('admin', appElement);
    await setupAdminEvents(role);
  } else {
    await loadView('dashboard', appElement);
    await setupDashboardEvents(role);
  }
}

/**
 * Fetches and injects an HTML partial into the app container.
 * Skips re-rendering if View is already the current one.
 */
async function loadView(
  view: 'login' | 'dashboard' | 'admin',
  appElement: HTMLElement
): Promise<void> {
  if (currentView === view) return;

  const urlMap = {
    login: '/src/pages/login.html',
    dashboard: '/src/pages/dashboard.html',
    admin: '/src/pages/admin.html',
  };

  try {
    const response = await fetch(urlMap[view]);
    if (!response.ok) throw new Error(`Failed to fetch ${view}.html: ${response.status}`);
    appElement.innerHTML = await response.text();
    currentView = view;
  } catch (error: any) {
    console.error('Error loading view:', error);
    appElement.innerHTML = `<p style="padding:20px;color:red;">Error loading content: ${error.message}</p>`;
    currentView = null;
  }
}

// ─────────────────────────────────────────────
// AUTH PAGE EVENTS
// ─────────────────────────────────────────────

function setupAuthEvents(): void {
  const authForm = document.getElementById('auth-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('auth-submit-btn') as HTMLButtonElement | null;
  const errorDiv = document.getElementById('auth-error') as HTMLDivElement | null;
  const tabLogin = document.getElementById('tab-login') as HTMLButtonElement | null;
  const tabSignup = document.getElementById('tab-signup') as HTMLButtonElement | null;
  const subtitle = document.getElementById('auth-subtitle');
  const fullnameGroup = document.getElementById('group-fullname') as HTMLDivElement | null;
  const confirmPasswordGroup = document.getElementById('group-confirm-password') as HTMLDivElement | null;
  const fullnameInput = document.getElementById('fullname') as HTMLInputElement | null;
  const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement | null;

  // Tab switching
  if (tabLogin && tabSignup && subtitle && submitBtn) {
    tabLogin.addEventListener('click', () => {
      isLoginMode = true;
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      subtitle.textContent = 'Sign in to access your account';
      submitBtn.textContent = 'Sign In';
      if (fullnameGroup) fullnameGroup.style.display = 'none';
      if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
      if (fullnameInput) fullnameInput.required = false;
      if (confirmPasswordInput) confirmPasswordInput.required = false;
      if (errorDiv) errorDiv.style.display = 'none';
    });

    tabSignup.addEventListener('click', () => {
      isLoginMode = false;
      tabSignup.classList.add('active');
      tabLogin.classList.remove('active');
      subtitle.textContent = 'Create an account to track your case';
      submitBtn.textContent = 'Sign Up';
      if (fullnameGroup) fullnameGroup.style.display = 'block';
      if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
      if (fullnameInput) fullnameInput.required = true;
      if (confirmPasswordInput) confirmPasswordInput.required = true;
      if (errorDiv) errorDiv.style.display = 'none';
    });
  }

  // Form submission
  if (authForm && submitBtn && errorDiv) {
    authForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();

      const emailInput = document.getElementById('email') as HTMLInputElement;
      const passwordInput = document.getElementById('password') as HTMLInputElement;

      if (!isLoginMode) {
        if (passwordInput.value !== (confirmPasswordInput?.value || '')) {
          showAuthError(errorDiv, 'Passwords do not match');
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';
      errorDiv.style.display = 'none';

      try {
        if (isLoginMode) {
          await login(emailInput.value, passwordInput.value);
        } else {
          await register(emailInput.value, passwordInput.value, fullnameInput?.value || '');
        }
        // Auth listener → router() handles view transition
      } catch (error: any) {
        showAuthError(errorDiv, mapAuthError(error));
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
      }
    });
  }
}

/** Maps Firebase Auth error codes to user-friendly messages */
function mapAuthError(error: any): string {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use')      return 'Email is already registered.';
  if (code === 'auth/weak-password')             return 'Password must be at least 6 characters.';
  if (code === 'auth/invalid-email')             return 'Invalid email format.';
  if (code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential')        return 'Invalid email or password.';
  if (code === 'auth/operation-not-allowed')     return 'Sign-up is currently disabled.';
  return `Error: ${error.message} (${code})`;
}

function showAuthError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.style.display = 'block';
}

// ─────────────────────────────────────────────
// CLIENT DASHBOARD EVENTS
// ─────────────────────────────────────────────

async function setupDashboardEvents(role: 'admin' | 'client'): Promise<void> {
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement | null;
  const mobileMenuBtn = document.getElementById('mobile-menu-btn') as HTMLButtonElement | null;
  const sidebar = document.getElementById('sidebar');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try { await logout(); } catch (e) { console.error('Logout error:', e); }
    };
  }

  if (mobileMenuBtn && sidebar && closeSidebarBtn) {
    mobileMenuBtn.onclick = () => sidebar.classList.add('open');
    closeSidebarBtn.onclick = () => sidebar.classList.remove('open');
  }

  const user = getCurrentUser();
  if (!user) return;

  // Show email immediately
  const navEmail = document.getElementById('nav-email');
  const navAvatar = document.getElementById('nav-avatar');
  const welcomeText = document.getElementById('welcome-text');
  if (navEmail) navEmail.textContent = user.email || '';
  if (role === 'admin') {
    const badge = document.getElementById('nav-role-badge');
    if (badge) badge.style.display = 'inline-block';
  }

  // Parallelize data fetches
  const profilePromise = getUserProfile(user.uid);
  const casePromise = getCaseByUserId(user.uid);

  profilePromise.then(profile => {
    const displayName = profile?.fullName || user.email?.split('@')[0] || 'Client';
    if (welcomeText) welcomeText.textContent = `Welcome back, ${displayName}`;
    if (navAvatar) navAvatar.textContent = displayName.charAt(0).toUpperCase();
  }).catch(e => console.error('Profile load error:', e));

  casePromise.then(caseData => {
    const caseStageEl = document.getElementById('case-stage');
    const caseSummaryEl = document.getElementById('case-summary');
    const kpiStatusText = document.getElementById('kpi-status-text');

    if (!caseData) {
      if (caseStageEl) caseStageEl.textContent = 'No Case Found';
      if (caseSummaryEl) caseSummaryEl.textContent = 'We could not locate an active case for your account.';
      if (kpiStatusText) kpiStatusText.textContent = 'Inactive';
    } else {
      if (caseStageEl) caseStageEl.innerHTML = `Case Stage: <strong>${caseData.caseStage}</strong>`;
      if (caseSummaryEl) caseSummaryEl.textContent = caseData.statusSummary;
      if (kpiStatusText) kpiStatusText.textContent = caseData.caseStage;
    }
  }).catch(e => console.error('Case data load error:', e));

  // View navigation
  const navDashboard = document.getElementById('nav-link-dashboard');
  const navCases = document.getElementById('nav-link-cases');
  const viewDashboard = document.getElementById('view-dashboard');
  const viewCases = document.getElementById('view-cases');

  if (navDashboard && navCases && viewDashboard && viewCases) {
    navDashboard.onclick = e => {
      e.preventDefault();
      viewDashboard.style.display = 'block';
      viewCases.style.display = 'none';
      navDashboard.classList.add('active');
      navCases.classList.remove('active');
    };

    navCases.onclick = async e => {
      e.preventDefault();
      viewDashboard.style.display = 'none';
      viewCases.style.display = 'block';
      navCases.classList.add('active');
      navDashboard.classList.remove('active');
      await renderCasesList(user.uid);
    };
  }
}

async function renderCasesList(userId: string): Promise<void> {
  const container = document.getElementById('cases-list-container');
  if (!container) return;

  container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:40px 0;font-weight:500;">Searching for cases...</p>`;

  try {
    const cases = await getAllCasesByUserId(userId);

    if (cases.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:80px 20px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;">
          <h3 style="color:var(--gold-accent);font-weight:700;">No cases found</h3>
          <p style="color:var(--text-muted);font-size:1.05rem;">When a new case is opened for you, it will appear here.</p>
        </div>`;
      return;
    }

    container.innerHTML = cases.map(c => `
      <div class="case-list-item" style="border:1px solid var(--border-default);border-radius:16px;padding:24px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);transition:all 0.2s ease;">
        <div style="display:flex;gap:24px;align-items:center;">
          <div style="width:56px;height:56px;background:rgba(201,164,74,0.08);color:var(--gold-accent);border-radius:12px;display:flex;align-items:center;justify-content:center;">
            <svg style="width:28px;height:28px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          </div>
          <div>
            <h4 style="margin:0;font-size:1.2rem;color:var(--text-primary);font-weight:700;">${escapeHtml(c.caseStage)}</h4>
            <p style="margin:6px 0 0;color:var(--text-muted);font-size:0.95rem;">Status: <span style="color:var(--gold-accent)">${escapeHtml(c.statusSummary)}</span></p>
          </div>
        </div>
      </div>`).join('');
  } catch (error) {
    console.error('Error rendering cases list:', error);
    container.innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px;">Failed to load cases. Please try again later.</p>`;
  }
}

// ─────────────────────────────────────────────
// ADMIN DASHBOARD EVENTS
// ─────────────────────────────────────────────

async function setupAdminEvents(role: 'admin' | 'client'): Promise<void> {
  // Sidebar mobile toggle
  const mobileMenuBtn = document.getElementById('admin-mobile-menu-btn');
  const sidebar = document.getElementById('admin-sidebar');
  const closeSidebarBtn = document.getElementById('admin-close-sidebar-btn');
  if (mobileMenuBtn && sidebar && closeSidebarBtn) {
    mobileMenuBtn.onclick = () => sidebar.classList.add('open');
    closeSidebarBtn.onclick = () => sidebar.classList.remove('open');
  }

  // Logout
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try { await logout(); } catch (e) { console.error('Logout error:', e); }
    };
  }

  // Show admin email in navbar
  const user = getCurrentUser();
  if (user) {
    const navEmail = document.getElementById('admin-nav-email');
    if (navEmail) navEmail.textContent = user.email || '';
    const navAvatar = document.getElementById('admin-nav-avatar');
    if (navAvatar) navAvatar.textContent = (user.email?.charAt(0) || 'A').toUpperCase();
    if (role === 'admin') {
      const badge = document.getElementById('admin-role-badge');
      if (badge) badge.style.display = 'inline-block';
    }
  }

  // Section Navigation
  const navItems = document.querySelectorAll<HTMLElement>('.sidebar-nav .nav-item[data-section]');
  const sections: Record<string, HTMLElement | null> = {
    'overview':      document.getElementById('admin-section-overview'),
    'create-case':   document.getElementById('admin-section-create-case'),
    'manage-cases':  document.getElementById('admin-section-manage-cases'),
    'documents':     document.getElementById('admin-section-documents'),
  };

  function showSection(sectionId: string) {
    Object.values(sections).forEach(el => { if (el) el.style.display = 'none'; });
    navItems.forEach(item => item.classList.remove('active'));

    const target = sections[sectionId];
    if (target) target.style.display = 'block';
    const activeNav = document.querySelector<HTMLElement>(`.sidebar-nav .nav-item[data-section="${sectionId}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Load data when switching to specific sections
    if (sectionId === 'manage-cases') renderAdminCasesList();
    if (sectionId === 'overview') loadAdminOverview();
  }

  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const section = item.getAttribute('data-section') || 'overview';
      showSection(section);
    });
  });

  // Load overview by default
  await loadAdminOverview();

  // Populate user dropdowns across all sections
  await populateUserDropdowns(['cc-user-select', 'doc-user-select']);

  // Setup sub-module event handlers
  setupCreateCaseForm();
  setupDocumentUpload();

  // Refresh button on manage cases
  const refreshBtn = document.getElementById('mc-refresh-btn');
  if (refreshBtn) {
    refreshBtn.onclick = () => renderAdminCasesList();
  }
}

/** Loads KPI stats on the admin overview */
async function loadAdminOverview(): Promise<void> {
  try {
    const [cases, users] = await Promise.all([getAllCases(), getAllUsers()]);

    const kpiCases   = document.getElementById('admin-kpi-cases');
    const kpiUsers   = document.getElementById('admin-kpi-users');
    const kpiActive  = document.getElementById('admin-kpi-active');
    const kpiClosed  = document.getElementById('admin-kpi-closed');

    if (kpiCases) kpiCases.textContent = String(cases.length);
    if (kpiUsers) kpiUsers.textContent = String(users.length);
    if (kpiActive) kpiActive.textContent  = String(cases.filter(c => c.caseStage !== 'Case Closed').length);
    if (kpiClosed) kpiClosed.textContent  = String(cases.filter(c => c.caseStage === 'Case Closed').length);
  } catch (e) {
    console.error('Error loading admin overview:', e);
  }
}

/** Populates a list of <select> elements with all registered users */
async function populateUserDropdowns(selectIds: string[]): Promise<void> {
  try {
    const users = await getAllUsers();
    const optionsHtml = users.length === 0
      ? `<option value="" disabled>No users registered yet</option>`
      : users.map(u => `<option value="${u.uid}">${escapeHtml(u.email)}${u.fullName ? ` — ${escapeHtml(u.fullName)}` : ''}</option>`).join('');

    selectIds.forEach(id => {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      if (el) {
        el.innerHTML = `<option value="" disabled selected>Select a client...</option>` + optionsHtml;
      }
    });
  } catch (e) {
    console.error('Error populating user dropdowns:', e);
  }
}

/** Wires up the Create Case form */
function setupCreateCaseForm(): void {
  const form = document.getElementById('create-case-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('cc-submit-btn') as HTMLButtonElement | null;
  const feedback = document.getElementById('cc-feedback');

  if (!form || !submitBtn || !feedback) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const userId = (document.getElementById('cc-user-select') as HTMLSelectElement)?.value;
    const caseStage = (document.getElementById('cc-stage-select') as HTMLSelectElement)?.value;
    const statusSummary = (document.getElementById('cc-status-summary') as HTMLTextAreaElement)?.value?.trim();

    if (!userId || !caseStage || !statusSummary) {
      showFeedback(feedback, 'Please fill in all fields.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></span> Creating...`;

    try {
      // TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
      await createCase({ userId, caseStage, statusSummary });

      showFeedback(feedback, `✓ Case created successfully for user.`, 'success');
      form.reset();

      // Re-populate dropdowns (reset clears select)
      await populateUserDropdowns(['cc-user-select', 'doc-user-select']);
    } catch (err: any) {
      showFeedback(feedback, `Failed to create case: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg> Create Case`;
    }
  });
}

/** Renders all cases as editable cards in the Manage Cases section */
async function renderAdminCasesList(): Promise<void> {
  const container = document.getElementById('mc-cases-container');
  if (!container) return;

  container.innerHTML = `
    <div class="admin-loading">
      <div class="loading-spinner"></div>
      <p>Loading all cases...</p>
    </div>`;

  try {
    // TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
    const cases = await getAllCases();

    if (cases.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px;">
          <p style="color:var(--text-muted);font-size:1rem;">No cases found. Use <strong style="color:var(--gold-accent)">Create Case</strong> to add one.</p>
        </div>`;
      return;
    }

    container.innerHTML = cases.map((c, idx) => buildCaseCard(c, idx)).join('');

    // Attach save handlers after render
    cases.forEach((c, idx) => {
      const saveBtn = document.getElementById(`save-case-btn-${idx}`);
      if (saveBtn && c.id) {
        saveBtn.addEventListener('click', () => saveAdminCase(c.id!, idx));
      }
    });
  } catch (err: any) {
    container.innerHTML = `<p style="color:#ef4444;padding:20px;">Error loading cases: ${err.message}</p>`;
  }
}

function buildCaseCard(c: Case, idx: number): string {
  const stageClass = getStageClass(c.caseStage);
  return `
    <div class="case-manage-card">
      <div class="case-manage-header">
        <div class="case-manage-icon">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        </div>
        <div class="case-manage-meta">
          <p class="case-manage-uid">UID: ${escapeHtml(c.userId)}</p>
          <span class="case-manage-stage-badge ${stageClass}">${escapeHtml(c.caseStage)}</span>
        </div>
      </div>
      <div class="case-manage-form-row">
        <div class="form-group">
          <label class="form-label" for="edit-stage-${idx}">Case Stage</label>
          <select id="edit-stage-${idx}" class="admin-select">
            ${CASE_STAGES.map(s => `<option value="${s}" ${s === c.caseStage ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-summary-${idx}">Status Summary</label>
          <textarea id="edit-summary-${idx}" class="admin-textarea" rows="2">${escapeHtml(c.statusSummary)}</textarea>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
        <button id="save-case-btn-${idx}" class="case-save-btn">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Save Changes
        </button>
        <span id="save-case-status-${idx}" style="font-size:0.8rem;color:var(--text-muted);"></span>
      </div>
    </div>`;
}

async function saveAdminCase(caseId: string, idx: number): Promise<void> {
  const stageEl   = document.getElementById(`edit-stage-${idx}`) as HTMLSelectElement | null;
  const summaryEl = document.getElementById(`edit-summary-${idx}`) as HTMLTextAreaElement | null;
  const saveBtn   = document.getElementById(`save-case-btn-${idx}`) as HTMLButtonElement | null;
  const statusEl  = document.getElementById(`save-case-status-${idx}`);

  if (!stageEl || !summaryEl || !saveBtn) return;

  const caseStage    = stageEl.value;
  const statusSummary = summaryEl.value.trim();

  if (!statusSummary) {
    if (statusEl) { statusEl.textContent = 'Status summary cannot be empty.'; statusEl.style.color = '#f87171'; }
    return;
  }

  saveBtn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Saving...'; statusEl.style.color = 'var(--text-muted)'; }

  try {
    // TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
    await updateCase(caseId, { caseStage, statusSummary });
    if (statusEl) { statusEl.textContent = '✓ Saved'; statusEl.style.color = '#4ade80'; }

    // Update the stage badge visually
    const badge = saveBtn.closest('.case-manage-card')?.querySelector('.case-manage-stage-badge');
    if (badge) {
      badge.textContent = caseStage;
      badge.className = `case-manage-stage-badge ${getStageClass(caseStage)}`;
    }

    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  } catch (err: any) {
    if (statusEl) { statusEl.textContent = `Error: ${err.message}`; statusEl.style.color = '#f87171'; }
  } finally {
    saveBtn.disabled = false;
  }
}

/** Wires up the Document Upload form */
function setupDocumentUpload(): void {
  const form = document.getElementById('upload-doc-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('doc-submit-btn') as HTMLButtonElement | null;
  const feedback = document.getElementById('doc-feedback');
  const fileInput = document.getElementById('doc-file-input') as HTMLInputElement | null;
  const dropZone = document.getElementById('file-drop-zone');
  const dropContent = document.getElementById('file-drop-content');

  if (!form || !submitBtn || !feedback || !fileInput) return;

  // Update label when file is chosen
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0] && dropContent) {
      dropContent.innerHTML = `
        <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color:var(--gold-accent);margin-bottom:8px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <p style="margin:0;color:var(--text-primary);font-size:0.875rem;font-weight:600;">${escapeHtml(fileInput.files[0].name)}</p>
        <p style="margin:4px 0 0;color:var(--text-muted);font-size:0.75rem;">${(fileInput.files[0].size / 1024).toFixed(1)} KB</p>`;
    }
  });

  // Drag & drop visual states
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const userId = (document.getElementById('doc-user-select') as HTMLSelectElement)?.value;
    const file = fileInput.files?.[0];

    if (!userId || !file) {
      showFeedback(feedback, 'Please select a client and a file.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></span> Uploading...`;

    try {
      // TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
      const downloadUrl = await uploadDocument(userId, file);
      showFeedback(feedback, `✓ File "${escapeHtml(file.name)}" uploaded successfully.`, 'success');
      form.reset();
      if (dropContent) {
        dropContent.innerHTML = `
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color:var(--gold-accent);opacity:0.6;margin-bottom:10px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
          <p style="margin:0;color:var(--text-muted);font-size:0.875rem;">Click to select or drag &amp; drop a file</p>
          <p style="margin:6px 0 0;color:var(--text-muted);font-size:0.75rem;opacity:0.6;">PDF, DOCX, PNG, JPG supported</p>`;
      }
      await populateUserDropdowns(['cc-user-select', 'doc-user-select']);
      console.log('Uploaded to:', downloadUrl);
    } catch (err: any) {
      showFeedback(feedback, `Upload failed: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Upload Document`;
    }
  });
}

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

/** Shows a success or error feedback message */
function showFeedback(el: HTMLElement, msg: string, type: 'success' | 'error'): void {
  el.textContent = msg;
  el.className = `admin-feedback ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

/** Returns the CSS class for a case stage badge */
function getStageClass(stage: string): string {
  if (stage === 'New Case (Onboarding)')  return 'stage-new';
  if (stage === 'Treatment Ongoing')      return 'stage-ongoing';
  if (stage === 'Treatment Complete')     return 'stage-complete';
  if (stage === 'Case Closed')            return 'stage-closed';
  return 'stage-new';
}

/** Escapes HTML to prevent XSS from user-generated content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

let isRouting = false;

function initializeApp() {
  console.log('Initializing App...');
  listenToAuthChanges(async user => {
    if (isRouting) return;
    isRouting = true;
    try {
      console.log('Auth state changed. User:', user?.email || 'Logged Out');
      isUserAuthenticated = !!user;
      currentView = null;
      await router();
    } finally {
      isRouting = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
