import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/layout/AdminLayout.tsx'
import { StoreLayout } from './components/layout/StoreLayout.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { CartProvider } from './context/CartContext.tsx'
import { WishlistProvider } from './context/WishlistContext.tsx'
import { AboutPage } from './pages/AboutPage.tsx'
import {
  AnalyticsAdminPage,
  BannersAdminPage,
  CategoriesAdminPage,
  CouponsAdminPage,
  CustomersAdminPage,
  OrdersAdminPage,
  ProductsAdminPage,
  ReviewsAdminPage,
  SettingsAdminPage,
} from './pages/admin/ManagePages.tsx'
import { DashboardPage } from './pages/admin/DashboardPage.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { CartPage } from './pages/CartPage.tsx'
import { CheckoutPage } from './pages/CheckoutPage.tsx'
import { ContactPage } from './pages/ContactPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { PrivacyPage, TermsPage } from './pages/LegalPage.tsx'
import { OrderPage } from './pages/OrderPage.tsx'
import { OrdersPage } from './pages/OrdersPage.tsx'
import { SalePage } from './pages/SalePage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { WishlistPage } from './pages/WishlistPage.tsx'
import { TrackPage } from './pages/TrackPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProductPage } from './pages/ProductPage.tsx'
import { RecipesPage } from './pages/RecipesPage.tsx'
import { ShopPage } from './pages/ShopPage.tsx'
import { WellnessPage } from './pages/WellnessPage.tsx'

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="shop" element={<ShopPage />} />
                <Route path="product/:slug" element={<ProductPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route path="checkout" element={<CheckoutPage />} />
                <Route path="order/:id" element={<OrderPage />} />
                <Route path="sale" element={<SalePage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="account" element={<SettingsPage />} />
                <Route path="track" element={<TrackPage />} />
                <Route path="track/:id" element={<TrackPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="wellness" element={<WellnessPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="login" element={<AuthPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="products" element={<ProductsAdminPage />} />
                <Route path="categories" element={<CategoriesAdminPage />} />
                <Route path="sale" element={<SalePage />} />
                <Route path="orders" element={<OrdersAdminPage />} />
                <Route path="customers" element={<CustomersAdminPage />} />
                <Route path="coupons" element={<CouponsAdminPage />} />
                <Route path="reviews" element={<ReviewsAdminPage />} />
                <Route path="banners" element={<BannersAdminPage />} />
                <Route path="analytics" element={<AnalyticsAdminPage />} />
                <Route path="settings" element={<SettingsAdminPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  )
}
