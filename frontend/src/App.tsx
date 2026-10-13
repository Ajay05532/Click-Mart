import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from './lib/api.ts'
import { StoreLayout } from './components/layout/StoreLayout.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { CartProvider } from './context/CartContext.tsx'
import { LocationProvider } from './context/LocationContext.tsx'
import { WishlistProvider } from './context/WishlistContext.tsx'
import { AboutPage } from './pages/AboutPage.tsx'
import { RequireAuth } from './components/auth/RequireAuth.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.tsx'
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
                <Route path="product/:slug" element={<ProductPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route path="checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
                <Route path="order/:id" element={<RequireAuth><OrderPage /></RequireAuth>} />
                <Route path="sale" element={<SalePage />} />
                <Route path="orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="account" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="track" element={<TrackPage />} />
                <Route path="track/:id" element={<TrackPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="wellness" element={<WellnessPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="contact" element={<ContactPage />} />
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
