/**
 * Main application entry point.
 * Handles routing and authenticates via Firebase.
 */

// Initialize Firebase
import './services/firebase';
import { login, logout, listenToAuthChanges, getCurrentUser, register } from './services/authService';
import { getCaseByUserId } from './services/caseService';

// Internal auth state tracker mapped to the latest Firebase state
let isUserAuthenticated = false;
let isLoginMode = true; // State for tracking the auth card mode

/**
 * Main function to handle routing based on authentication state
 */
async function router(): Promise<void> {
  const appElement = document.getElementById('app');
  
  if (!appElement) {
    console.error('Root #app element not found');
    return;
  }

  try {
    if (isUserAuthenticated) {
      // Load dashboard UI
      const response = await fetch('/src/pages/dashboard.html');
      const html = await response.text();
      appElement.innerHTML = html;
      setupDashboardEvents();
    } else {
      // Load login UI
      const response = await fetch('/src/pages/login.html');
      const html = await response.text();
      appElement.innerHTML = html;
      setupAuthEvents(); // Renamed to setupAuthEvents to reflect dual-mode
    }
  } catch (error) {
    console.error('Error loading page:', error);
    appElement.innerHTML = '<p>Error loading content.</p>';
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
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logout();
        // On success, the onAuthStateChangedListener will detect the change and route to login
      } catch (error) {
        console.error('Error during logout:', error);
      }
    });
  }

  // Load and render Case Information securely
  const caseStageEl = document.getElementById('case-stage');
  const caseSummaryEl = document.getElementById('case-summary');

  if (caseStageEl && caseSummaryEl) {
    const user = getCurrentUser();
    
    if (!user) {
      caseStageEl.textContent = 'Error';
      caseSummaryEl.textContent = 'No user session found.';
      return;
    }

    try {
      const caseData = await getCaseByUserId(user.uid);
      
      if (!caseData) {
        caseStageEl.innerHTML = '<span style="color: #ef4444; font-weight: 500;">No case found</span>';
        caseSummaryEl.textContent = 'We could not locate an active case for your account.';
      } else {
        // Create an elegant stage tracker display
        caseStageEl.innerHTML = `
          <div class="stage active" style="margin: 0; display: inline-block;">${caseData.caseStage}</div>
        `;
        caseSummaryEl.textContent = caseData.statusSummary;
      }
    } catch (error) {
      console.error('Error fetching dashboard case details:', error);
      caseStageEl.innerHTML = '<span style="color: #ef4444; font-weight: 500;">Error</span>';
      caseSummaryEl.textContent = 'Failed to load case data. Please try again later.';
    }
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
  listenToAuthChanges((user) => {
    isUserAuthenticated = !!user;
    router(); // Re-trigger router to load correct view anytime auth state changes
  });
}
