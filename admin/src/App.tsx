import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout.tsx'
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
import { AuditPage, SettingsPage, StaffPage } from './pages/Admin.tsx'
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
        <Route path="orders" element={<OrdersPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="banners" element={<BannersPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
