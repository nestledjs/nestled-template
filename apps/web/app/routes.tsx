import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  // Global layout - provides GlobalContextProvider and Apollo context to ALL routes
  route('', './routes/_layout.tsx', [
    // Public routes (no conflicting paths)
    route('', './routes/_public/_layout.tsx', [
      index('./routes/_public/_index.tsx'),
      // route('about', './routes/_public/about.tsx'),
      route('login', './routes/_public/login.tsx'),
      route('register', './routes/_public/register.tsx'),
      route('forgot-password', './routes/_public/forgot-password.tsx'),
      route('resend-verification', './routes/_public/resend-verification.tsx'),
      route('reset-password', './routes/_public/reset-password.tsx'),
      route('verify-email', './routes/_public/verify-email.tsx'),
      route('features', './routes/_public/features.tsx'),
      route('pricing', './routes/pricing.tsx'),
      route('blog', './routes/_public/blog.tsx'),
      // route('contact', './routes/_public/contact.tsx'),
      // route('privacy-policy', './routes/_public/privacy-policy.tsx'),
      // route('terms-and-conditions', './routes/_public/terms-and-conditions.tsx'),
    ]),

    // Standalone unauthorized page (outside of public layout to avoid conflicts)
    // route('unauthorized', './routes/_public/unauthorized.tsx'),
    // Logout route clears cookies and cache, then redirects to login
    route('logout', './routes/logout.tsx'),
    // Force logout - server-side only, clears HttpOnly cookie and redirects to login (no Apollo)
    route('force-logout', './routes/force-logout.tsx'),
    // Accept organization invitation route
    route('accept-invitation', './routes/accept-invitation.tsx'),
    // Checkout routes
    route('checkout/success', './routes/checkout/success.tsx'),
    route('checkout/cancel', './routes/checkout/cancel.tsx'),
    // MCP OAuth org picker — shown when connecting an AI assistant to a multi-org account
    route('mcp-connect', './routes/mcp-connect.tsx'),

    // Authenticated areas - all share the same sidebar/userback layout
    // route('', './routes/_auth_layout.tsx', [
    //   // Members area - clean namespace separation
    //   route('members', './routes/members/_layout.tsx', [
    //     route('dashboard', './routes/members/dashboard/_layout.tsx', [
    //       index('./routes/members/dashboard/_index.tsx'),
    //       route('attendance', './routes/members/dashboard/attendance.tsx'),
    //       route('biz', './routes/members/dashboard/biz.tsx'),
    //       route('my-referrals', './routes/members/dashboard/my-referrals.tsx'),
    //       route('referrals-sent', './routes/members/dashboard/referrals-sent.tsx'),
    //       route('substitute-requests', './routes/members/dashboard/substitute-requests.tsx'),
    //       route('power-hours', './routes/members/dashboard/power-hours.tsx'),
    //       route('notes', './routes/members/dashboard/notes.tsx'),
    //       route('new-biz', './routes/members/dashboard/new-biz.tsx'),
    //       route('new-biz/:referralId', './routes/members/dashboard/new-biz.[$referralId].tsx'),
    //       route('new-referral', './routes/members/dashboard/new-referral.tsx'),
    //       route('new-power-hour', './routes/members/dashboard/new-power-hour.tsx'),
    //     ]),
    //
    //     route('support', './routes/members/support.tsx'),
    //     route('release-notes', './routes/members/release-notes.tsx'),
    //
    //   ]),
    // ]),

    // Authenticated area - shared auth layout for members and settings
    route('', './routes/_authenticated/_layout.tsx', [
      // Members area
      route('members', './routes/members/_layout.tsx', [
        index('./routes/members/_index.tsx'),
        route('dashboard', './routes/members/dashboard.tsx'),
      ]),

      // Settings area - organization and user settings
      route('settings', './routes/settings/_layout.tsx', [
        route('profile', './routes/settings/profile.tsx'),
        route('account', './routes/settings/account.tsx'),
        route('organization', './routes/settings/organization.tsx'),
        route('members', './routes/settings/members.tsx'),
        route('billing', './routes/settings/billing.tsx'),
        route('security', './routes/settings/security.tsx'),
        route('security/events', './routes/settings/security.events.tsx'),
        route('notifications', './routes/settings/notifications.tsx'),
        route('preferences', './routes/settings/preferences.tsx'),
      ]),

      // Admin panel - super admin only
      route('admin', './routes/admin/_layout.tsx', [
        index('./routes/admin/_index.tsx'),
        route('users', './routes/admin/users/_index.tsx'),
        route('organizations', './routes/admin/organizations/_index.tsx'),
        route('security-events', './routes/admin/security-events/_index.tsx'),
        route('audit-logs', './routes/admin/audit-logs/_index.tsx'),
        route('analytics', './routes/admin/analytics/_index.tsx'),
        route('settings', './routes/admin/settings/_index.tsx'),
        route('billing', './routes/admin/billing/_index.tsx'),
        route('billing/plans', './routes/admin/billing/plans.tsx'),
        route('billing/subscriptions', './routes/admin/billing/subscriptions.tsx'),
        route('data', './routes/admin/data/_layout.tsx', [
          index('./routes/admin/data/index.tsx'),
          route(':dataTypePlural', './routes/admin/data/$dataTypePlural.tsx'),
          route(':dataType/create', './routes/admin/data/$dataType.create.tsx'),
          route(':dataType/:id', './routes/admin/data/$dataType.$id.tsx'),
        ]),
      ]),
    ]),

    // Sitemap
    route('sitemap.xml', './routes/sitemap.xml.ts'),
  ]),
] satisfies RouteConfig
