import { Navigate, Route, Routes } from 'react-router-dom'
import { Can, Layout } from './Layout.tsx'
import { BannersPage } from './pages/Banners.tsx'
import { BrandsPage } from './pages/Brands.tsx'
import { CategoriesPage } from './pages/Categories.tsx'
import { CouponsPage } from './pages/Coupons.tsx'
import { CustomersPage } from './pages/Customers.tsx'
import { DashboardPage } from './pages/Dashboard.tsx'
import { InventoryPage } from './pages/Inventory.tsx'
import { LoginPage } from './pages/Login.tsx'
import { OffersPage } from './pages/Offers.tsx'
import { OrdersPage } from './pages/Orders.tsx'
import { ProductsPage } from './pages/Products.tsx'
import { ReviewsPage } from './pages/Reviews.tsx'
import { ReportsPage } from './pages/Reports.tsx'
import { SupportPage } from './pages/Support.tsx'
import { SupportContentPage } from './pages/SupportContent.tsx'
import { SupportTicketPage } from './pages/SupportTicket.tsx'
import { StaffPage } from './pages/Admin.tsx'
import { SettingsPage } from './pages/Settings.tsx'
import { AuditPage } from './pages/ActivityLog.tsx'
import { AccountPage } from './pages/Account.tsx'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/Recovery.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<Can perm="orders"><OrdersPage /></Can>} />
        <Route path="products" element={<Can perm="catalog"><ProductsPage /></Can>} />
        <Route path="inventory" element={<Can perm="inventory"><InventoryPage /></Can>} />
        <Route path="categories" element={<Can perm="catalog"><CategoriesPage /></Can>} />
        <Route path="brands" element={<Can perm="catalog"><BrandsPage /></Can>} />
        <Route path="offers" element={<Can perm="marketing"><OffersPage /></Can>} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="banners" element={<Can perm="marketing"><BannersPage /></Can>} />
        <Route path="reviews" element={<Can perm="marketing"><ReviewsPage /></Can>} />
        <Route path="support" element={<Can perm="support"><SupportPage /></Can>} />
        <Route path="support/:id" element={<Can perm="support"><SupportTicketPage /></Can>} />
        <Route path="reports" element={<Can perm="reports"><ReportsPage /></Can>} />
        <Route path="help-content" element={<Can perm="support"><SupportContentPage /></Can>} />
        <Route path="customers" element={<Can perm="customers"><CustomersPage /></Can>} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
