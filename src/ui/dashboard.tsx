// Dashboard page — usage stats, account info, GitHub connection
// All API calls authenticated via x-api-key header from localStorage

import { html } from "hono/html";
import { Layout } from "./layout.tsx";

export function DashboardPage() {
  return Layout({
    title: "Dashboard",
    children: html`
      <div class="min-h-screen" x-data="dashboardApp()" x-init="init()">
        <!-- Top ambient glow -->
        <div class="fixed top-0 left-1/4 w-[500px] h-[300px] bg-accent-cyan/3 rounded-full blur-[100px] pointer-events-none"></div>
        <div class="fixed top-0 right-1/4 w-[400px] h-[250px] bg-accent-emerald/3 rounded-full blur-[100px] pointer-events-none"></div>

        <!-- Header -->
        <header class="border-b border-white/5 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50">
          <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-surface-700 glow-border flex items-center justify-center">
                <svg class="w-4 h-4 text-accent-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span class="font-semibold text-white text-sm tracking-tight">Copilot Proxy</span>
            </div>

            <div class="flex items-center gap-4">
              <template x-if="user">
                <div class="flex items-center gap-3">
                  <img :src="user.avatar_url" class="w-7 h-7 rounded-full ring-2 ring-accent-cyan/20" />
                  <span class="text-sm text-gray-300" x-text="user.login"></span>
                </div>
              </template>
              <button @click="logout()" class="btn-ghost text-xs">Logout</button>
            </div>
          </div>
        </header>

        <main class="max-w-6xl mx-auto px-6 py-8">
          <!-- GitHub Connection Banner -->
          <template x-if="!githubConnected">
            <div class="glass-card p-6 mb-8 glow-border animate-in flex items-center justify-between">
              <div>
                <h3 class="text-white font-medium mb-1">Connect GitHub Account</h3>
                <p class="text-sm text-gray-400">Link your GitHub account to use Copilot API with your own token.</p>
              </div>
              <button @click="startGithubAuth()" class="btn-primary" :disabled="deviceFlow.loading">
                <span x-show="!deviceFlow.loading">Connect GitHub</span>
                <span x-show="deviceFlow.loading">Connecting...</span>
              </button>
            </div>
          </template>

          <!-- Device Flow Modal -->
          <template x-if="deviceFlow.userCode">
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in">
              <div class="glass-card p-8 max-w-md w-full mx-4 glow-cyan">
                <h3 class="text-white text-lg font-semibold mb-2">GitHub Authorization</h3>
                <p class="text-gray-400 text-sm mb-6">Enter this code on GitHub to authorize:</p>

                <div class="bg-surface-900 rounded-xl p-6 text-center mb-6 glow-border">
                  <code class="text-3xl font-mono font-bold text-accent-cyan tracking-[0.3em]" x-text="deviceFlow.userCode"></code>
                </div>

                <a :href="deviceFlow.verificationUri" target="_blank"
                   class="btn-primary w-full block text-center mb-4">
                  Open GitHub →
                </a>

                <div class="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25"/>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75"/>
                  </svg>
                  Waiting for authorization...
                </div>

                <button @click="cancelDeviceFlow()" class="btn-ghost w-full mt-4">Cancel</button>
              </div>
            </div>
          </template>

          <!-- Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <!-- Premium Requests -->
            <div class="glass-card p-6 hover-lift animate-in delay-1">
              <div class="flex items-center justify-between mb-4">
                <span class="text-xs font-medium text-gray-500 uppercase tracking-widest">Premium Requests</span>
                <div class="w-2 h-2 rounded-full status-pulse"
                     :class="usageData ? (usagePercent > 90 ? 'bg-accent-rose' : usagePercent > 70 ? 'bg-accent-amber' : 'bg-accent-emerald') : 'bg-gray-600'"></div>
              </div>
              <template x-if="usageData">
                <div>
                  <div class="flex items-baseline gap-2 mb-3">
                    <span class="text-3xl font-bold text-white font-mono" x-text="usageData.quota_snapshots.premium_interactions.entitlement - usageData.quota_snapshots.premium_interactions.remaining"></span>
                    <span class="text-sm text-gray-500">/ <span x-text="usageData.quota_snapshots.premium_interactions.entitlement"></span></span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill"
                         :class="usagePercent > 90 ? 'bg-accent-rose' : usagePercent > 70 ? 'bg-gradient-to-r from-accent-amber to-accent-rose' : 'bg-gradient-to-r from-accent-cyan to-accent-emerald'"
                         :style="'width:' + usagePercent + '%'"></div>
                  </div>
                  <p class="text-xs text-gray-500 mt-2">
                    <span x-text="usageData.quota_snapshots.premium_interactions.remaining"></span> remaining
                    · Resets <span x-text="formatDate(usageData.quota_reset_date)"></span>
                  </p>
                </div>
              </template>
              <template x-if="!usageData && !usageError">
                <div class="space-y-2">
                  <div class="h-8 bg-surface-600 rounded animate-pulse"></div>
                  <div class="h-2 bg-surface-600 rounded animate-pulse"></div>
                </div>
              </template>
              <template x-if="usageError">
                <p class="text-sm text-gray-500">Unable to load</p>
              </template>
            </div>

            <!-- Chat Completions -->
            <div class="glass-card p-6 hover-lift animate-in delay-2">
              <div class="flex items-center justify-between mb-4">
                <span class="text-xs font-medium text-gray-500 uppercase tracking-widest">Chat Quota</span>
                <svg class="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <template x-if="usageData">
                <div>
                  <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-2xl font-bold text-white font-mono"
                          x-text="usageData.quota_snapshots.chat.unlimited ? '∞' : usageData.quota_snapshots.chat.remaining"></span>
                    <span class="text-xs text-gray-500" x-show="!usageData.quota_snapshots.chat.unlimited">remaining</span>
                    <span class="text-xs text-accent-emerald" x-show="usageData.quota_snapshots.chat.unlimited">unlimited</span>
                  </div>
                  <p class="text-xs text-gray-500">
                    Plan: <span class="text-gray-300" x-text="usageData.copilot_plan"></span>
                  </p>
                </div>
              </template>
              <template x-if="!usageData">
                <div class="h-8 bg-surface-600 rounded animate-pulse"></div>
              </template>
            </div>

            <!-- Completions -->
            <div class="glass-card p-6 hover-lift animate-in delay-3">
              <div class="flex items-center justify-between mb-4">
                <span class="text-xs font-medium text-gray-500 uppercase tracking-widest">Completions</span>
                <svg class="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
              </div>
              <template x-if="usageData">
                <div>
                  <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-2xl font-bold text-white font-mono"
                          x-text="usageData.quota_snapshots.completions.unlimited ? '∞' : usageData.quota_snapshots.completions.remaining"></span>
                    <span class="text-xs text-gray-500" x-show="!usageData.quota_snapshots.completions.unlimited">remaining</span>
                    <span class="text-xs text-accent-emerald" x-show="usageData.quota_snapshots.completions.unlimited">unlimited</span>
                  </div>
                  <p class="text-xs text-gray-500">Code completions</p>
                </div>
              </template>
              <template x-if="!usageData">
                <div class="h-8 bg-surface-600 rounded animate-pulse"></div>
              </template>
            </div>
          </div>

          <!-- Info Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Account Info -->
            <div class="glass-card p-6 animate-in delay-4">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Account</h3>
              <template x-if="user">
                <div class="flex items-center gap-4">
                  <img :src="user.avatar_url" class="w-12 h-12 rounded-xl ring-2 ring-white/5" />
                  <div>
                    <p class="text-white font-medium" x-text="user.name || user.login"></p>
                    <p class="text-sm text-gray-500" x-text="'@' + user.login"></p>
                  </div>
                </div>
              </template>
              <template x-if="!user && githubConnected">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-surface-600 animate-pulse"></div>
                  <div class="space-y-2">
                    <div class="h-4 w-32 bg-surface-600 rounded animate-pulse"></div>
                    <div class="h-3 w-24 bg-surface-600 rounded animate-pulse"></div>
                  </div>
                </div>
              </template>
              <template x-if="!githubConnected">
                <p class="text-sm text-gray-500">No GitHub account connected</p>
              </template>
            </div>

            <!-- API Info -->
            <div class="glass-card p-6 animate-in delay-5">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">API Endpoints</h3>
              <div class="space-y-3 font-mono text-xs">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald text-[10px] font-bold">POST</span>
                  <span class="text-gray-300">/v1/chat/completions</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald text-[10px] font-bold">POST</span>
                  <span class="text-gray-300">/v1/messages</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald text-[10px] font-bold">POST</span>
                  <span class="text-gray-300">/v1/responses</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald text-[10px] font-bold">POST</span>
                  <span class="text-gray-300">/v1/embeddings</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan text-[10px] font-bold">GET</span>
                  <span class="text-gray-300">/v1/models</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <script>
        function dashboardApp() {
          return {
            accessKey: '',
            user: null,
            githubConnected: false,
            usageData: null,
            usageError: false,
            usagePercent: 0,
            deviceFlow: {
              loading: false,
              userCode: null,
              verificationUri: null,
              deviceCode: null,
              pollTimer: null,
            },

            init() {
              this.accessKey = localStorage.getItem('access_key') || '';
              if (!this.accessKey) {
                window.location.href = '/';
                return;
              }
              this.loadMe();
              this.loadUsage();
              // Auto-refresh every 60s
              setInterval(() => this.loadUsage(), 60000);
            },

            authHeaders() {
              return { 'x-api-key': this.accessKey };
            },

            async loadMe() {
              try {
                const resp = await fetch('/auth/me', { headers: this.authHeaders() });
                if (resp.status === 401) { this.kickToLogin(); return; }
                const data = await resp.json();
                this.githubConnected = data.github_connected;
                this.user = data.user;
              } catch (e) {
                console.error('Failed to load user info:', e);
              }
            },

            async loadUsage() {
              try {
                const resp = await fetch('/api/usage', { headers: this.authHeaders() });
                if (resp.status === 401) { this.kickToLogin(); return; }
                if (resp.ok) {
                  this.usageData = await resp.json();
                  const pi = this.usageData.quota_snapshots.premium_interactions;
                  this.usagePercent = pi.entitlement > 0
                    ? Math.round(((pi.entitlement - pi.remaining) / pi.entitlement) * 100)
                    : 0;
                  this.usageError = false;
                } else {
                  this.usageError = true;
                }
              } catch (e) {
                this.usageError = true;
              }
            },

            formatDate(dateStr) {
              if (!dateStr) return '';
              const d = new Date(dateStr);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            },

            async startGithubAuth() {
              this.deviceFlow.loading = true;
              try {
                const resp = await fetch('/auth/github', { headers: this.authHeaders() });
                if (resp.status === 401) { this.kickToLogin(); return; }
                const data = await resp.json();
                if (data.user_code) {
                  this.deviceFlow.userCode = data.user_code;
                  this.deviceFlow.verificationUri = data.verification_uri;
                  this.deviceFlow.deviceCode = data.device_code;
                  this.pollDeviceFlow(data.interval || 5);
                }
              } catch (e) {
                console.error('Failed to start device flow:', e);
              } finally {
                this.deviceFlow.loading = false;
              }
            },

            pollDeviceFlow(interval) {
              this.deviceFlow.pollTimer = setInterval(async () => {
                try {
                  const resp = await fetch('/auth/github/poll', {
                    method: 'POST',
                    headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_code: this.deviceFlow.deviceCode }),
                  });
                  if (resp.status === 401) { this.kickToLogin(); return; }
                  const data = await resp.json();
                  if (data.status === 'complete') {
                    this.cancelDeviceFlow();
                    this.user = data.user;
                    this.githubConnected = true;
                    await this.loadUsage();
                  } else if (data.status === 'slow_down') {
                    clearInterval(this.deviceFlow.pollTimer);
                    this.pollDeviceFlow((data.interval || interval) + 1);
                  } else if (data.status === 'error') {
                    this.cancelDeviceFlow();
                    alert('Authorization failed: ' + data.error);
                  }
                } catch (e) {
                  console.error('Poll error:', e);
                }
              }, interval * 1000);
            },

            cancelDeviceFlow() {
              if (this.deviceFlow.pollTimer) {
                clearInterval(this.deviceFlow.pollTimer);
                this.deviceFlow.pollTimer = null;
              }
              this.deviceFlow.userCode = null;
              this.deviceFlow.verificationUri = null;
              this.deviceFlow.deviceCode = null;
            },

            logout() {
              localStorage.removeItem('access_key');
              window.location.href = '/';
            },

            kickToLogin() {
              localStorage.removeItem('access_key');
              window.location.href = '/';
            }
          }
        }
      </script>`,
  });
}
