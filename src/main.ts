/**
 * Main application entry point.
 * Handles routing and authenticates via Firebase.
 */

// Initialize Firebase
import './services/firebase';
import { login, logout, listenToAuthChanges, getCurrentUser, register, getUserProfile } from './services/authService';
import { getCaseByUserId, getAllCasesByUserId } from './services/caseService';
import type { Case } from './services/caseService';

// Internal auth state tracker mapped to the latest Firebase state
let isUserAuthenticated = false;
let isLoginMode = true; // State for tracking the auth card mode
let currentView: 'login' | 'dashboard' | null = null; // Track currently loaded HTML view

/**
 * Main function to handle routing based on authentication state
 */
async function router(): Promise<void> {
  const appElement = document.getElementById('app');
  
  if (!appElement) return;

  const targetView = isUserAuthenticated ? 'dashboard' : 'login';
  
  // Optimization: Don't re-fetch and re-render if we're already on the correct view
  if (currentView === targetView) return;

  try {
    const pageUrl = targetView === 'dashboard' ? '/src/pages/dashboard.html' : '/src/pages/login.html';
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${targetView}.html: ${response.status}`);
    
    const html = await response.text();
    appElement.innerHTML = html;
    currentView = targetView;

    if (isUserAuthenticated) {
      await setupDashboardEvents();
    } else {
      setupAuthEvents();
    }
  } catch (error: any) {
    console.error('Error loading page:', error);
    appElement.innerHTML = `<p style="padding: 20px; color: red;">Error loading content: ${error.message}</p>`;
    currentView = null;
  }
}

/**
 * Initializes interactive elements for the authentication page
 */
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

  // Setup tab toggling functionality
  if (tabLogin && tabSignup && subtitle && submitBtn) {
    tabLogin.addEventListener('click', () => {
      isLoginMode = true;
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      subtitle.textContent = 'Sign in to access your account';
      submitBtn.textContent = 'Sign In';
      
      // Hide signup fields
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
      
      // Show signup fields
      if (fullnameGroup) fullnameGroup.style.display = 'block';
      if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
      if (fullnameInput) fullnameInput.required = true;
      if (confirmPasswordInput) confirmPasswordInput.required = true;

      if (errorDiv) errorDiv.style.display = 'none';
    });
  }
  
  if (authForm && submitBtn && errorDiv) {
    authForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      
      const emailInput = document.getElementById('email') as HTMLInputElement;
      const passwordInput = document.getElementById('password') as HTMLInputElement;
      
      // Additional validations for Signup
      if (!isLoginMode) {
        if (passwordInput.value !== (confirmPasswordInput?.value || '')) {
          errorDiv.textContent = 'Passwords do not match';
          errorDiv.style.display = 'block';
          return;
        }
      }

      // Update UI state
      submitBtn.disabled = true;
      submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';
      errorDiv.style.display = 'none';

      try {
        if (isLoginMode) {
          await login(emailInput.value, passwordInput.value);
        } else {
          const fullname = fullnameInput?.value || '';
          await register(emailInput.value, passwordInput.value, fullname);
        }
        // On success, the onAuthStateChanged listener will automatically detect the state
        // change and re-route to the dashboard.
      } catch (error: any) {
        // Map Firebase error codes to user-friendly messages
        let friendlyMessage = 'Authentication failed. Please try again.';
        if (error.code === 'auth/email-already-in-use') {
          friendlyMessage = 'Email already registered';
        } else if (error.code === 'auth/weak-password') {
          friendlyMessage = 'Password must be at least 6 characters';
        } else if (error.code === 'auth/invalid-email') {
          friendlyMessage = 'Invalid email format';
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          friendlyMessage = 'Invalid email or password';
        } else if (error.code === 'auth/operation-not-allowed') {
          friendlyMessage = 'Sign-up is not allowed. Please enable Email/Password auth in Firebase Console.';
        } else {
          // Expose raw error for debugging unsupported codes
          friendlyMessage = `Error: ${error.message} (${error.code})`;
        }

        // Show error message
        errorDiv.textContent = friendlyMessage;
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
      }
    });
  }
}

/**
 * Initializes interactive elements for the dashboard page
 */
async function setupDashboardEvents(): Promise<void> {
  const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement | null;
  const mobileMenuBtn = document.getElementById('mobile-menu-btn') as HTMLButtonElement | null;
  const sidebar = document.getElementById('sidebar');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');
  
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        await logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
    };
  }

  // Sidebar mobile toggle
  if (mobileMenuBtn && sidebar && closeSidebarBtn) {
    mobileMenuBtn.onclick = () => sidebar.classList.add('open');
    closeSidebarBtn.onclick = () => sidebar.classList.remove('open');
  }

  // Bind Navbar and Header Data
  const user = getCurrentUser();
  if (user) {
    const navEmail = document.getElementById('nav-email');
    const navAvatar = document.getElementById('nav-avatar');
    const welcomeText = document.getElementById('welcome-text');

    // Show immediate data from Auth object
    if (navEmail) navEmail.textContent = user.email || '';
    
    // Performance Optimization: Parallelize Firestore requests
    const profilePromise = getUserProfile(user.uid);
    const casePromise = getCaseByUserId(user.uid);

    // Update Profile UI as soon as it arrives
    profilePromise.then(profile => {
      const displayName = profile?.fullName || user.email?.split('@')[0] || 'Client';
      if (welcomeText) welcomeText.textContent = `Welcome back, ${displayName}`;
      if (navAvatar) navAvatar.textContent = displayName.charAt(0).toUpperCase();
    }).catch(e => console.error('Profile load error:', e));

    // Update Case UI independently
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

    // Navigation Switching Logic
    const navDashboard = document.getElementById('nav-link-dashboard');
    const navCases = document.getElementById('nav-link-cases');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewCases = document.getElementById('view-cases');

    if (navDashboard && navCases && viewDashboard && viewCases) {
      navDashboard.onclick = (e) => {
        e.preventDefault();
        viewDashboard.style.display = 'block';
        viewCases.style.display = 'none';
        navDashboard.classList.add('active');
        navCases.classList.remove('active');
      };

      navCases.onclick = async (e) => {
        e.preventDefault();
        viewDashboard.style.display = 'none';
        viewCases.style.display = 'block';
        navCases.classList.add('active');
        navDashboard.classList.remove('active');
        await renderCasesList(user.uid);
      };
    }
  }
}

/**
 * Renders the full list of cases for the "My Cases" view
 */
async function renderCasesList(userId: string): Promise<void> {
  const container = document.getElementById('cases-list-container');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px 0;">Searching for cases...</p>';

  try {
    const cases = await getAllCasesByUserId(userId);

    if (cases.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <div style="font-size: 3rem; color: var(--border-color); margin-bottom: 16px;">
            <svg style="width: 64px; height: 64px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </div>
          <h3 style="margin-bottom: 8px;">No cases till now</h3>
          <p style="color: var(--text-muted);">When a new case is opened for you, it will appear here.</p>
        </div>
      `;
      return;
    }

    // Render Case Cards
    container.innerHTML = cases.map(c => `
      <div class="case-list-item" style="border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; background: #fff; transition: transform 0.2s ease;">
        <div style="display: flex; gap: 20px; align-items: center;">
          <div style="width: 48px; height: 48px; background: rgba(30, 58, 138, 0.05); color: var(--primary-color); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
             <svg style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          </div>
          <div>
            <h4 style="margin: 0; font-size: 1.1rem; color: var(--text-main);">${c.caseStage}</h4>
            <p style="margin: 4px 0 0; color: var(--text-muted); font-size: 0.9rem;">Status: ${c.statusSummary}</p>
          </div>
        </div>
        <div>
          <button class="secondary-btn">View Details</button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error rendering cases list:', error);
    container.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 20px;">Failed to load cases. Please try again later.</p>';
  }
}


// Initial script execution: Setup Firebase Auth Listener
// This listener runs automatically on page load and on any sign-in/sign-out events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

function initializeApp() {
  console.log('Initializing App...');
  listenToAuthChanges((user) => {
    console.log('Auth state changed. User:', user?.email || 'Logged Out');
    isUserAuthenticated = !!user;
    router(); // Re-trigger router to load correct view anytime auth state changes
  });
}
