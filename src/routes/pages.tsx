// Page routes — serve SSR HTML pages for login and dashboard

import type { Context } from "hono";
import { LoginPage } from "../ui/login.tsx";
import { DashboardPage } from "../ui/dashboard.tsx";

export const loginPage = (c: Context) => {
  return c.html(LoginPage());
};

export const dashboardPage = (c: Context) => {
  return c.html(DashboardPage());
};
