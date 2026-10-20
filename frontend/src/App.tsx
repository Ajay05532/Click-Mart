import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ApiError } from './lib/api.ts'
import { StoreLayout } from './components/layout/StoreLayout.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { CartProvider } from './context/CartContext.tsx'
import { LocationProvider } from './context/LocationContext.tsx'
import { WishlistProvider } from './context/WishlistContext.tsx'
import { RequireAuth } from './components/auth/RequireAuth.tsx'
import { HomePage } from './pages/HomePage.tsx'

const AboutPage = lazy(() => import('./pages/AboutPage.tsx').then((module) => ({ default: module.AboutPage })))
const AuthPage = lazy(() => import('./pages/AuthPage.tsx').then((module) => ({ default: module.AuthPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx').then((module) => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.tsx').then((module) => ({ default: module.ResetPasswordPage })))
const CartPage = lazy(() => import('./pages/CartPage.tsx').then((module) => ({ default: module.CartPage })))
const CheckoutPage = lazy(() => import('./pages/CheckoutPage.tsx').then((module) => ({ default: module.CheckoutPage })))
const ContactPage = lazy(() => import('./pages/ContactPage.tsx').then((module) => ({ default: module.ContactPage })))
const HelpCenterPage = lazy(() => import('./pages/HelpCenterPage.tsx').then((module) => ({ default: module.HelpCenterPage })))
const MyRequestsPage = lazy(() => import('./pages/MyRequestsPage.tsx').then((module) => ({ default: module.MyRequestsPage })))
const NewRequestPage = lazy(() => import('./pages/NewRequestPage.tsx').then((module) => ({ default: module.NewRequestPage })))
const TicketPage = lazy(() => import('./pages/TicketPage.tsx').then((module) => ({ default: module.TicketPage })))
const PrivacyPage = lazy(() => import('./pages/LegalPage.tsx').then((module) => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/LegalPage.tsx').then((module) => ({ default: module.TermsPage })))
const OrderPage = lazy(() => import('./pages/OrderPage.tsx').then((module) => ({ default: module.OrderPage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage.tsx').then((module) => ({ default: module.OrdersPage })))
const SalePage = lazy(() => import('./pages/SalePage.tsx').then((module) => ({ default: module.SalePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then((module) => ({ default: module.SettingsPage })))
const WishlistPage = lazy(() => import('./pages/WishlistPage.tsx').then((module) => ({ default: module.WishlistPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx').then((module) => ({ default: module.NotFoundPage })))
const ProductPage = lazy(() => import('./pages/ProductPage.tsx').then((module) => ({ default: module.ProductPage })))
const RecipesPage = lazy(() => import('./pages/RecipesPage.tsx').then((module) => ({ default: module.RecipesPage })))
const ShopPage = lazy(() => import('./pages/ShopPage.tsx').then((module) => ({ default: module.ShopPage })))
const WellnessPage = lazy(() => import('./pages/WellnessPage.tsx').then((module) => ({ default: module.WellnessPage })))

function TrackRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={id ? `/order/${id}` : '/orders'} replace />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LocationProvider>
      <CartProvider>
        <WishlistProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="shop" element={<ShopPage />} />
                <Route path="category/:category" element={<ShopPage />} />
                <Route path="category/:category/:sub" element={<ShopPage />} />
                <Route path="product/:slug" element={<ProductPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route path="checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
                <Route path="order/:id" element={<RequireAuth><OrderPage /></RequireAuth>} />
                <Route path="sale" element={<SalePage />} />
                <Route path="orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="account" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="track" element={<Navigate to="/orders" replace />} />
                <Route path="track/:id" element={<TrackRedirect />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="wellness" element={<WellnessPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="help" element={<HelpCenterPage />} />
                <Route path="help/new" element={<NewRequestPage />} />
                <Route path="help/tickets" element={<RequireAuth><MyRequestsPage /></RequireAuth>} />
                <Route path="help/tickets/:code" element={<RequireAuth><TicketPage /></RequireAuth>} />
                <Route path="login" element={<AuthPage />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
      </LocationProvider>
    </AuthProvider>
    </QueryClientProvider>
  )
}
